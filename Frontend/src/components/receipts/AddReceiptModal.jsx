import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { formatTaxRate, taxTypeDedupKey, taxTypesMatch } from "../../utils/receiptFormatters";
import { containsEmoji, stripEmoji } from "../../utils/emojiUtils";
import SimpleAlertModal from "../SimpleAlertModal";
import { X, Upload, FileText, Image, Trash2, ChevronDown, Plus, MoreHorizontal, Minus, ChevronLeft, ChevronRight, Pencil, Camera, PenLine, AlertCircle } from "lucide-react";
import ReceiptAnnotator from "./ReceiptAnnotator";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../../context/DataContext";
import Toast from "../Toast";
import { getPaymentDisplayFromReceipt, usePaymentDisplay } from "../../hooks/usePaymentDisplay";
import {
  apiPaymentMethodMatchesLabel,
  buildPaymentMethodStorageString,
  cardTypeIntToBrand,
  getApiPaymentMethodDisplayName,
  getLast4FromPaymentApiRecord,
  getPaymentMethodListLabel,
  inferCardTypeFromPayment,
  isCustomCardIssuer,
  parsePaymentDisplay,
  readPayCardTypeMap,
  storedCardIssuerName,
} from "../../utils/paymentMethodUtils";
import MerchantAvatar from "../MerchantAvatar";
import { parseReceipt, pdfToImage, canvasToBlob } from "../../utils/receiptParser";
import { parseTaxRateInput, createTaxRateKeyDownHandler } from "../../utils/taxRateInput";
import { useTaxRateLimitAlert } from "../../hooks/useTaxRateLimitAlert";
import { buildExpenseCategoryOptions } from "../../utils/expenseCategories";
import TaxRateChangeWarningModal from "../TaxRateChangeWarningModal";
import {
  buildIncrementedTaxName,
  propagateTaxNameChangeToReceipts,
  propagateTaxRateChangeToReceipts,
  taxRatesDiffer,
} from "../../utils/taxTypeUtils";
import {
  splitMediaField,
  buildCombinedMediaField,
  normalizeMediaUrl as normalizeMediaUrlCore,
  replaceUrlInMediaCsv,
  isPdfUrl,
  sanitizeUploadFile,
} from "../../utils/mediaUrlUtils";
import PdfThumbnail from "./PdfThumbnail";
import { findRenamedApiMerchant } from "../../utils/merchantListUtils";
import EditPaymentMethodModal from "./EditPaymentMethodModal";

// Payment method logos (for Add Payment Method modal card type list)
const Visa              = "/payment-logos/Visa.png";
const MasterCard        = "/payment-logos/MasterCard.png";
const PayPal            = "/payment-logos/PayPal.png";
const AmericanExpress   = "/payment-logos/AmericanExpress.webp";
const Discover          = "/payment-logos/discover.png";
const DinersClub        = "/payment-logos/DinersClub.png";
const Cash              = "/payment-logos/Cash.jpg";
const DebitCard         = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";

// Tag icons
import flagDeselect from "../../assets/receipttags/flag_deselect.png";
import flagSelect from "../../assets/receipttags/flag_select.png";
import reconcileDeselect from "../../assets/receipttags/reconile_deselect.png";
import reconcileSelect from "../../assets/receipttags/reconile_select.png";
import reimbursedDeselect from "../../assets/receipttags/reimbursed_deselect.png";
import reimbursedSelect from "../../assets/receipttags/reimbursed_select.png";
import starredDeselect from "../../assets/receipttags/starred_deselect.png";
import starredSelect from "../../assets/receipttags/starred_select.png";
import verifiedDeselect from "../../assets/receipttags/verified_deselect.png";
import verifiedSelect from "../../assets/receipttags/verified_select.png";
import warrantedDeselect from "../../assets/receipttags/warrantied_deselect.png";
import warrantedSelect from "../../assets/receipttags/warrantied_select.png";
import lockedImg from "../../assets/receipttags/locked.png";
import unlockedImg from "../../assets/receipttags/unlocked.png";

/**
 * Duplicate flow: required fields in order (date → merchant → total).
 * Returns the first user-facing error message, or null if valid.
 */
function getDuplicateReceiptValidationMessage(formData) {
  if (formData?.product_date == null || String(formData.product_date).trim() === "") {
    return "Please select date";
  }
  if (formData?.storeName == null || String(formData.storeName).trim() === "") {
    return "Please select merchant";
  }
  const rawTotal = formData?.purchasePrice;
  if (rawTotal == null || String(rawTotal).trim() === "") {
    return "Please enter total";
  }
  const total = parseFloat(String(rawTotal).trim());
  if (!Number.isFinite(total) || total === 0) {
    return "Please enter total";
  }
  return null;
}

/** Describe Purchase (`product_name`): default to "Duplicate" when blank, otherwise append " (1)". */
function withDuplicateDefaultProductName(formData) {
  if (!formData) return formData;
  const trimmed = String(formData.product_name ?? "").trim();
  if (trimmed) return { ...formData, product_name: `${trimmed} (1)` };
  return { ...formData, product_name: "Duplicate" };
}

const AddReceiptModal = ({ onClose, onReceiptAdded, initialData = null, onDuplicate = null }) => {
  const MAX_NOTES_LENGTH = 500;
  const MAX_DESCRIPTION_LENGTH = 100;
  const {
    merchants,
    paymentMethods,
    receipts,
    expenseCategories,
    taxData,
    merchantsWithImages,
    refreshData,
    silentRefreshData,
    addTax,
    updateTax,
    deleteTax,
    fetchTaxes,
    updateReceipt,
    addExpenseCategory,
    addCustomMerchant,
    editCustomMerchant,
    deleteCustomMerchant,
    addCustomCategory,
    editCustomCategory,
    deleteCustomCategory,
    addApiMerchant,
    saveMerchLogo,
    hideMerchant,
    hideCategory,
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
    addApiPaymentMethod,
    updateApiPaymentMethod,
    deleteApiPaymentMethod,
    editCustomPaymentMethod,
    deleteCustomPaymentMethod,
    hidePaymentMethod,
  } = useData();
  const { getPaymentLogo, getPaymentDisplay } = usePaymentDisplay();

  const [alertMsg, setAlertMsg] = useState(null);
  const [showMaxDefaultTaxModal, setShowMaxDefaultTaxModal] = useState(false);
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [step, setStep] = useState("upload"); // "upload" or "form"
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadedReceiptData, setUploadedReceiptData] = useState(null);
  const [localImageFile, setLocalImageFile] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [detectedMerchantLogo, setDetectedMerchantLogo] = useState(null);

 // Add Merchant modal state
const [showAddMerchantModal, setShowAddMerchantModal] = useState(false);
const [newMerchantName, setNewMerchantName] = useState("");
const [newMerchantLogo, setNewMerchantLogo] = useState("");
const [isFetchingLogos, setIsFetchingLogos] = useState(false);
const [logoOptions, setLogoOptions] = useState([]);
const [selectedLogoIndex, setSelectedLogoIndex] = useState(null);
const [localMerchants, setLocalMerchants] = useState([]);

  // Add Payment Method modal state
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [payModalEditMode, setPayModalEditMode] = useState(null); // null | { name, apiId }
  const [newPaymentCardType, setNewPaymentCardType] = useState("");
  const [newCardIssuerName, setNewCardIssuerName] = useState("");
  const [newLast4Digits, setNewLast4Digits] = useState("");
  const [newPaymentCategoryType, setNewPaymentCategoryType] = useState(""); // Business/Personal
  const [localPaymentMethods, setLocalPaymentMethods] = useState([]); // Local list of payment methods
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState([]);

  // ── Options menu ("...") ──────────────────────────────────────────────────
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = useRef(null);

  // ── Payment-method add/edit confirmation (same pattern as Settings / ReceiptDetail) ──
  const [showPayEditConfirm, setShowPayEditConfirm] = useState(false);
  const [pendingPayEditFn, setPendingPayEditFn] = useState(null);
  const [payConfirmMessage, setPayConfirmMessage] = useState("");
  const [isPayMethodSaving, setIsPayMethodSaving] = useState(false);
  // ── Payment-method delete confirmation ────────────────────────────────────
  const [showPayDeleteConfirm, setShowPayDeleteConfirm] = useState(false);
  const [pendingPayDeleteMethod, setPendingPayDeleteMethod] = useState(null);

  // ── Duplicate feature ─────────────────────────────────────────────────────
  const [isDuplicated, setIsDuplicated] = useState(false);       // true = already used once
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false); // banner visible
  const [isDuplicateSaving, setIsDuplicateSaving] = useState(false); // saving in-progress

  // ── Split feature ─────────────────────────────────────────────────────────
  const [showSplitScreen, setShowSplitScreen] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState(null); // null=overview, N=editing split N
  const [splits, setSplits] = useState([]);
  const [isSavingSplits, setIsSavingSplits] = useState(false);
  const [splitErrors, setSplitErrors] = useState({}); // { [split._id]: { amount: "msg", ... } }

  // Form fields state
  const [formData, setFormData] = useState({
    receipt_category: "", // 0 = Personal, 1 = Business
    storeName: "",
    expense_type: "",
    paymentType: "",
    card_issuer_name: "", // Card issuer name for display (e.g., "Omi")
    last_4_digit_card: "", // Last 4 digits for display
    product_date: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
    subtotal: "",
    purchasePrice: "",
    product_name: "",
    notes: "",
    receipt_tax_values: [],
    tip: "", // Tip amount
  });

  // Tags state
  const [tags, setTags] = useState({
    locked: false,
    starred: false,
    flagged: false,
    verified: false,
    reconciled: false,
    reimbursed: false,
    warrantied: false,
  });

  // Currency input display state — tracks raw text while user is typing in Totals fields
  const [currencyInputs, setCurrencyInputs] = useState({ total: "", tax0: "", tax1: "", tip: "" });
  const setCurrencyInput = (key, val) => setCurrencyInputs((prev) => ({ ...prev, [key]: val }));

  // Dropdown visibility states
  const [showMerchantDropdown, setShowMerchantDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showTaxDropdown, setShowTaxDropdown] = useState(null); // null, 1, or 2 for which tax field
  const [isMerchantTyping, setIsMerchantTyping] = useState(false);
  const [isPaymentTyping, setIsPaymentTyping] = useState(false);
  const [isCategoryTyping, setIsCategoryTyping] = useState(false);

  // Add Expense Category inline state
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Toast state
  const [toast, setToast] = useState({ isVisible: false, message: "", type: "success" });

  // Edit/Delete Expense Category state
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isSavingEditCategory, setIsSavingEditCategory] = useState(false);
  const [editCategoryError, setEditCategoryError] = useState(null);
  const [showCategoryEditConfirm, setShowCategoryEditConfirm] = useState(false);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  // Manage Tax Types modal state
  const [showManageTaxModal, setShowManageTaxModal] = useState(false);
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");
  const [newTaxNumber, setNewTaxNumber] = useState("");
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState(null); // Track which tax is being edited
  const [isDeletingTax, setIsDeletingTax] = useState(false);
  const [taxDropdownKey, setTaxDropdownKey] = useState(0);
  // Locally-added tax types that persist for this modal session regardless of context refreshes
  const [localTaxTypes, setLocalTaxTypes] = useState([]);
  const [showAddTaxForm, setShowAddTaxForm] = useState(false);
  const manageTaxModalBodyRef = useRef(null);
  const [taxRateFocused, setTaxRateFocused] = useState(false);
  const [showTaxRateChangeWarning, setShowTaxRateChangeWarning] = useState(false);
  const [pendingTaxUpdate, setPendingTaxUpdate] = useState(null);

  // ── Tax field validation banners ─────────────────────────────────────────
  const TAX_NAME_MAX   = 15;
  const TAX_RATE_MAX   = 99.999;
  const MAX_RECEIPT_TAX_TYPES = 2;
  const MAX_RECEIPT_TAX_MSG =
    "A maximum of two tax types can be selected. Please remove one before selecting another.";
  const TAX_NUMBER_MAX = 35;

  const [taxNameOverflow, setTaxNameOverflow]           = useState(false);
  const { message: taxRateLimitAlert, showAlert: showTaxRateLimitAlert, clearAlert: clearTaxRateLimitAlert } = useTaxRateLimitAlert();
  const [taxNumberOverflow, setTaxNumberOverflow]       = useState(false);
  const [descriptionOverflow, setDescriptionOverflow]   = useState(false);
  const [notesOverflow, setNotesOverflow]               = useState(false);

  // IMPORTANT: allTaxTypes must be declared HERE — before isDuplicateTaxName and taxNameError —
  // to avoid a Temporal Dead Zone crash when the user types in the tax name field.
  // (useMemo deps taxData/localTaxTypes/taxDropdownKey are all initialized above.)
  const allTaxTypes = useMemo(() => {
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
      };
      const existing = taxMap.get(key);
      if (!existing || (!existing.id && entry.id)) {
        taxMap.set(key, entry);
      }
    };
    // Primary source: taxData reflects server state
    if (Array.isArray(taxData)) taxData.forEach(addToMap);
    // Secondary: session-only taxes not yet in taxData
    const taxDataKeys = new Set((taxData || []).map(taxTypeDedupKey).filter(Boolean));
    if (Array.isArray(localTaxTypes)) {
      localTaxTypes
        .filter((t) => !taxDataKeys.has(taxTypeDedupKey(t)))
        .forEach(addToMap);
    }
    return Array.from(taxMap.values());
  }, [taxData, localTaxTypes, taxDropdownKey]);

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

  const isBlockedTaxRateInput = (val) => {
    const str = String(val).replace(/%/g, "").trim();
    return str === "99.999" || str === "999";
  };

  const taxNameError = taxNameOverflow
    ? `Character limit of ${TAX_NAME_MAX} exceeded`
    : (newTaxName.trim() && isDuplicateTaxName(newTaxName.trim(), editingTaxId || null)
      ? `"${newTaxName.trim()}" already exists. Please use a different name.`
      : "");

  const taxRateError = (newTaxRate !== "" && isBlockedTaxRateInput(newTaxRate)
    ? "Tax Rate cannot be 99.999 or 999."
    : (newTaxRate !== "" && parseFloat(newTaxRate) > TAX_RATE_MAX
    ? `Maximum tax rate of ${TAX_RATE_MAX}% exceeded`
    : (newTaxRate !== "" && hasMoreThan3Decimals(newTaxRate)
      ? "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)"
      : "")));

  const taxNumberError = taxNumberOverflow
    ? `Character limit of ${TAX_NUMBER_MAX} exceeded`
    : null;
  const taxFormHasError = !!(taxNameError || taxRateError || taxNumberError);

  const defaultTaxIds = useMemo(() => {
    return (taxData || []).filter(t => parseInt(t.is_default_tax) === 1).map(t => t.id);
  }, [taxData]);

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
      const taxPayload = {
        ...taxToToggle,
        is_default_tax: isCurrentlyDefault ? 0 : 1,
      };
      await updateTax(taxPayload);
    } catch (e) {
      console.error("Failed to update default tax", e);
    }
  };

  const fileInputRef = useRef(null);
  const addPhotoInputRef = useRef(null);
  const merchantInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const paymentInputRef = useRef(null);

  const resetReceiptMediaState = useCallback((options = {}) => {
    const { clearFiles = true } = options;
    setUploadedMediaUrls([]);
    setUploadedImageUrl(null);
    setUploadedReceiptData(null);
    setLocalImageFile(null);
    setPdfPreviewUrl(null);
    setDetectedMerchantLogo(null);
    if (clearFiles) setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = "";
  }, []);

  // ── Add Photo / Annotation state ──────────────────────────────────────────
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [annotatorUrl, setAnnotatorUrl] = useState(null); // URL being annotated
  const [annotatorIndex, setAnnotatorIndex] = useState(null); // index in uploadedMediaUrls (-1 = new blank)

  // ── Edit / Delete Merchant ────────────────────────────────────────────────
  const [showEditMerchantModal, setShowEditMerchantModal] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null); // { name, image }
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

  // ── Pre-fill from initialData (duplicate mode) ───────────────────────────
  useEffect(() => {
    if (!initialData) {
      // Ensure plain "Add receipt" starts from a fully clean media state.
      resetReceiptMediaState();
      return;
    }
    if (initialData.formData)        setFormData(initialData.formData);
    if (initialData.tags)            setTags(initialData.tags);
    if (initialData.uploadedMediaUrls) setUploadedMediaUrls(initialData.uploadedMediaUrls);
    if (initialData.uploadedImageUrl)  setUploadedImageUrl(initialData.uploadedImageUrl);
    if (initialData.pdfPreviewUrl)     setPdfPreviewUrl(initialData.pdfPreviewUrl);
    if (initialData.uploadedReceiptData)
      setUploadedReceiptData({ ...initialData.uploadedReceiptData, id: 0 });
    // Sync the raw currency display string so the Total field shows the value
    if (initialData.formData?.purchasePrice)
      setCurrencyInput("total", String(initialData.formData.purchasePrice));
    // Jump straight to the form — skip the upload screen
    setStep("form");
    setIsDuplicateMode(true);
    setIsDuplicated(true); // prevent double-duplicate
  }, [initialData, resetReceiptMediaState]);

  // Ensure all media URLs from receipt payload are represented in the gallery.
  // Older flows may provide multiple URLs only in receipt_image/emailAttachment.
  useEffect(() => {
    if (!uploadedReceiptData) return;
    const receiptFieldUrls = [
      ...splitMediaField(uploadedReceiptData.receipt_image),
      ...splitMediaField(uploadedReceiptData.emailAttachment),
    ];
    if (receiptFieldUrls.length === 0) return;
    setUploadedMediaUrls((prev) => {
      const seen = new Set(
        (prev || [])
          .map((u) => normalizeMediaUrl(nonEmptyUrl(u) || ""))
          .filter((u) => u && u !== "0"),
      );
      const next = [...(prev || [])];
      receiptFieldUrls.forEach((u) => {
        const normalized = normalizeMediaUrl(nonEmptyUrl(u) || "");
        if (!normalized || normalized === "0" || seen.has(normalized)) return;
        seen.add(normalized);
        next.push(u);
      });
      return next;
    });
  }, [uploadedReceiptData]);

  const acceptedFileTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ];

  // Clean OCR text values so placeholders show instead of 0
  const cleanTextValue = (value) => {
    if (value === null || value === undefined) return "";
    const str = value.toString().trim();

    // remove garbage OCR values
    if (
      str === "" ||
      str === "0" ||
      str === "null" ||
      str === "undefined" ||
      str === "NaN"
    ) {
      return "";
    }

    return str;
  };
  const normalizeMediaUrl = (url) => normalizeMediaUrlCore(url) || "0";

  // Returns null for values that should not be sent to the API as an image URL:
  // blob: URLs (ephemeral, invalid after page refresh), the "0" sentinel, and empty strings.
  // Use in || chains so these values are skipped in favour of the next candidate.
  const nonEmptyUrl = (url) => {
    if (!url || typeof url !== "string") return null;
    const s = url.trim();
    return (s && s !== "0" && !s.startsWith("blob:")) ? s : null;
  };

  // Get proper payment display name (handles 0*0 type issues)
  const getPaymentDisplayName = (paymentType) => {
    if (!paymentType) return "";
    const type = paymentType.toString().trim();

    // Handle invalid values like "0*0", "0", empty strings
    if (!type || type === "0" || type === "0*0" || /^0\*\d+$/.test(type)) {
      return "";
    }

    // If it contains * and looks like a card number pattern, extract name
    if (type.includes("*")) {
      const parts = type.split("*");
      // If first part is "0" or empty, try to determine type from logo
      if (parts[0] === "0" || parts[0] === "") {
        return "";
      }
    }

    return type;
  };

  // Get tag image based on status
  const getTagImage = (tagName, isActive) => {
    const tagImages = {
      starred: isActive ? starredSelect : starredDeselect,
      flagged: isActive ? flagSelect : flagDeselect,
      verified: isActive ? verifiedSelect : verifiedDeselect,
      reconciled: isActive ? reconcileSelect : reconcileDeselect,
      reimbursed: isActive ? reimbursedSelect : reimbursedDeselect,
      warrantied: isActive ? warrantedSelect : warrantedDeselect,
    };
    return tagImages[tagName];
  };

  // Toggle tag
  const toggleTag = (tagName) => {
    setTags((prev) => ({
      ...prev,
      [tagName]: !prev[tagName],
    }));
  };

  useEffect(() => {
    fetchApiExpenseCategories?.();
  }, [fetchApiExpenseCategories]);

  // API categories first, then receipt-derived names (same source as Homepage filter).
  const allExpenseCategories = useMemo(
    () =>
      buildExpenseCategoryOptions({
        apiExpenseCategories,
        receiptCategories: expenseCategories,
        includeDefaultsWhenEmpty: true,
      }),
    [apiExpenseCategories, expenseCategories]
  );

  // Get all merchants with their images from merchantsWithImages - deduplicated by name
  // Include locally added merchants
  const allMerchantsWithImages = (() => {
    const uniqueMap = new Map();
    // Add context merchants first (API + receipt-derived logos)
    (merchantsWithImages || []).forEach((m) => {
      const normalizedName = (m?.name || "").toString().trim().toLowerCase();
      if (!normalizedName) return;
      uniqueMap.set(normalizedName, m);
    });
    // localMerchants are set immediately when the user updates a logo — they take
    // priority so the new image is visible right away without waiting for a refetch.
    localMerchants.forEach((m) => {
      const normalizedName = (m?.name || "").toString().trim().toLowerCase();
      if (!normalizedName) return;
      const existing = uniqueMap.get(normalizedName);
      if (!existing) {
        uniqueMap.set(normalizedName, m);
      } else if (m?.image) {
        // Always overwrite with the freshest local image
        uniqueMap.set(normalizedName, { ...existing, image: m.image });
      }
    });
    return Array.from(uniqueMap.values());
  })();

  // Get merchant image by name - check local merchants first, then merchantsWithImages
  // Update your getMerchantImage function in AddReceiptModal
  const getMerchantImage = (name) => {
    if (!name) return null;
    const normalizedName = name.toString().trim().toLowerCase();

    // First check local merchants (newly added ones in current session)
    const localMerchant = localMerchants.find(
      (m) => m.name?.toString().trim().toLowerCase() === normalizedName,
    );
    if (localMerchant?.image) return localMerchant.image;

    // Then check merchantsWithImages from context (these come from receipts)
    const contextMerchant = allMerchantsWithImages.find(
      (m) => m.name?.toString().trim().toLowerCase() === normalizedName,
    );
    if (contextMerchant?.image) return contextMerchant.image;

    // Fallback to persisted merchant logos.
    try {
      const savedLogos = JSON.parse(localStorage.getItem("cat_merch_logos") || "{}");
      const exactKey = Object.keys(savedLogos).find(
        (k) => k.toString().trim().toLowerCase() === normalizedName,
      );
      if (exactKey && savedLogos[exactKey]) return savedLogos[exactKey];
    } catch {}

    return null;
  };

  // Build canonical payment method list — same source as Filter and Edit Receipt so
  // all four places show the same entries:
  // 1. normalizedPaymentMethods (receipt-enriched, deduplicated) as base
  // 2. API-registered cards not yet covered (no receipts for that card yet)
  const allPaymentMethods = useMemo(() => {
    const seen = new Map();   // lowercaseKey → display string
    const seenLast4 = new Set();

    const addEntry = (raw) => {
      if (!raw) return;
      const val = raw.toString().trim();
      if (!val || val === "0" || val === "0*0" || /^0\*\d*$/.test(val)) return;
      if (val.length < 2) return;
      if (/^cash\s*\*\s*0$/i.test(val)) return;
      if (/\*\s*0$/.test(val)) return;
      const key = val.toLowerCase();
      if (seen.has(key)) return;
      const last4 = val.match(/\*(\d{3,4})$/)?.[1];
      if (last4 && seenLast4.has(last4)) return;
      seen.set(key, val);
      if (last4) seenLast4.add(last4);
    };

    // Step 1: canonical DataContext list (receipt-enriched names win)
    (paymentMethods || []).forEach(addEntry);

    // Step 2: API records not already covered (cards with no receipts yet)
    (apiPaymentMethods || []).forEach((m) => {
      if (String(m?.card_type || "").toLowerCase() === "merchant") return;
      addEntry(getApiPaymentMethodDisplayName(m));
    });

    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [paymentMethods, apiPaymentMethods]);

  // allTaxTypes is declared earlier (before isDuplicateTaxName) to avoid a TDZ crash.

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFiles = (fileList) => {
    const validFiles = [];
    const errors = [];

    Array.from(fileList).forEach((file) => {
      if (!acceptedFileTypes.includes(file.type)) {
        errors.push(
          `${file.name}: Invalid file type. Please upload images or PDFs.`,
        );
      } else if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: File too large. Maximum size is 10MB.`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      setError(errors.join("\n"));
    }

    return validFiles;
  };

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    const droppedFiles = e.dataTransfer.files;
    const validFiles = validateFiles(droppedFiles);

    if (validFiles.length > 0) {
      setFiles(validFiles);

      // Generate PDF preview if PDF is dropped
      const firstFile = validFiles[0];
      if (
        firstFile.type === "application/pdf" ||
        firstFile.name.toLowerCase().endsWith(".pdf")
      ) {
        await generatePdfPreview(firstFile);
      } else {
        // Clear PDF preview if non-PDF file is dropped
        setPdfPreviewUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return null;
        });
      }
    }
  }, []);

  // Upload files to /user/uploadmediaV1 and return array of fullImageUrls
  const uploadFilesToMedia = useCallback(async (filesToUpload) => {
    const token = localStorage.getItem("token");

    const formData = new FormData();
    filesToUpload.forEach((file) => {
      formData.append("file", sanitizeUploadFile(file)); // API field name is "file", supports multiple
    });

    const response = await fetch("/api/user/uploadmediaV1", {
      method: "POST",
      headers: {
        Accesstoken: token,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("uploadmediaV1 error:", errorText);
      throw new Error(`Media upload failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("uploadmediaV1 response:", data);

    const isHttpUrl = (value) =>
      typeof value === "string" && /^https?:\/\//i.test(value.trim());

    // API returns array of { fullImageUrl: "string" }
    if (Array.isArray(data)) {
      const urls = data
        .map((item) => (item?.fullImageUrl || "").toString().trim())
        .filter((url) => isHttpUrl(url));
      // uploadmediaV1 is cumulative — it returns ALL historical uploads for the
      // user, not just the files in this request.  Always take the last N URLs
      // (oldest-first ordering) so we only keep the files we just uploaded and
      // never bleed URLs from a previous receipt into this one.
      if (filesToUpload.length > 0) {
        return urls.slice(-filesToUpload.length);
      }
      return urls;
    }

    // Fallback: single object
    if (isHttpUrl(data?.fullImageUrl)) {
      return [data.fullImageUrl.toString().trim()];
    }

    return [];
  }, []);

  const handleFileSelect = async (e) => {
    setError(null);
    const selectedFiles = e.target.files;
    const validFiles = validateFiles(selectedFiles);

    if (validFiles.length > 0) {
      setFiles(validFiles);

      // Generate PDF preview if PDF is selected
      const firstFile = validFiles[0];
      if (
        firstFile.type === "application/pdf" ||
        firstFile.name.toLowerCase().endsWith(".pdf")
      ) {
        await generatePdfPreview(firstFile);
      } else {
        // Clear PDF preview if non-PDF file is selected
        setPdfPreviewUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return null;
        });
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ── Add Photo handler (in the form step receipt images section) ─────────
  const handleAddPhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = "";
    setIsAddingPhoto(true);
    try {
      const newUrls = await uploadFilesToMedia([file]);
      if (newUrls.length > 0) {
        setUploadedMediaUrls((prev) => {
          const existing = new Set(prev);
          const uniqueNew = newUrls.filter((u) => u && !existing.has(u));
          return [...prev, ...uniqueNew];
        });
      } else {
        // Fallback: upload returned empty — use local blob URL for display
        const localUrl = URL.createObjectURL(file);
        setUploadedMediaUrls((prev) => (prev.includes(localUrl) ? prev : [...prev, localUrl]));
      }
    } catch (err) {
      console.error("Add photo upload failed:", err);
      // Fallback: use local object URL
      const localUrl = URL.createObjectURL(file);
      setUploadedMediaUrls((prev) => (prev.includes(localUrl) ? prev : [...prev, localUrl]));
    } finally {
      setIsAddingPhoto(false);
    }
  };

  // ── Annotation save handler ──────────────────────────────────────────────
  const handleAnnotationSave = (dataUrl) => {
    const rawReplaced =
      annotatorIndex !== null && annotatorIndex >= 0
        ? uploadedMediaUrls[annotatorIndex]
        : annotatorUrl;
    const neReplaced = nonEmptyUrl(rawReplaced);
    const normOld = neReplaced ? normalizeMediaUrl(neReplaced) : "";

    if (annotatorIndex !== null && annotatorIndex >= 0) {
      setUploadedMediaUrls((prev) =>
        prev.map((url, i) => (i === annotatorIndex ? dataUrl : url))
      );
    } else {
      setUploadedMediaUrls((prev) => [...prev, dataUrl]);
    }

    if (normOld && normOld !== "0") {
      setUploadedReceiptData((prev) => {
        if (!prev) return prev;
        const email0 = (prev.emailAttachment ?? "").toString();
        const receipt0 = (prev.receipt_image ?? "").toString();
        const mergedEmail = replaceUrlInMediaCsv(email0, normOld, dataUrl);
        const mergedReceipt = replaceUrlInMediaCsv(receipt0, normOld, dataUrl);
        if (mergedEmail === email0 && mergedReceipt === receipt0) return prev;
        return {
          ...prev,
          emailAttachment: normalizeMediaUrl(mergedEmail) || "0",
          receipt_image: normalizeMediaUrl(mergedReceipt) || "0",
        };
      });
    }

    setAnnotatorUrl(null);
    setAnnotatorIndex(null);
  };

  const removeFile = (index) => {
    setFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      // Clear PDF preview if no PDF files remain
      if (
        newFiles.length === 0 ||
        !newFiles.some(
          (f) =>
            f.type === "application/pdf" ||
            f.name.toLowerCase().endsWith(".pdf"),
        )
      ) {
        setPdfPreviewUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return null;
        });
      }
      return newFiles;
    });
  };

  const removeUploadedMediaAt = (index) => {
    setUploadedMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const getFilePreview = (file) => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    if (file.type === "application/pdf") {
      // Return PDF preview URL if available, otherwise return null
      return pdfPreviewUrl;
    }
    return null;
  };

  // Generate PDF preview from file
  const generatePdfPreview = async (pdfFile) => {
    try {
      if (
        pdfFile.type !== "application/pdf" &&
        !pdfFile.name.toLowerCase().endsWith(".pdf")
      ) {
        return;
      }

      // Clean up previous preview URL if exists
      setPdfPreviewUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        return null;
      });

      // Convert PDF to canvas
      const canvas = await pdfToImage(pdfFile);

      // Convert canvas to blob
      const blob = await canvasToBlob(canvas);

      // Create object URL for preview
      const previewUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl(previewUrl);
    } catch (error) {
      console.error("Failed to generate PDF preview:", error);
      // Don't set error state here, just log it - PDF can still be uploaded
    }
  };

  // Helper function to calculate total from subtotal, taxes, and tip
  const calculateTotal = (subtotal, taxValues, tip) => {
    const subtotalNum = parseFloat(subtotal) || 0;
    const tipNum = parseFloat(tip) || 0;
    const totalTaxes = (taxValues || []).reduce((sum, t) => {
      return sum + (parseFloat(t.tax_amount) || 0);
    }, 0);
    return (subtotalNum + totalTaxes + tipNum).toFixed(2);
  };

  // Helper function to calculate subtotal from total, taxes, and tip
  const calculateSubtotal = (total, taxValues, tip) => {
    const totalNum = parseFloat(total) || 0;
    const tipNum = parseFloat(tip) || 0;
    const totalTaxes = (taxValues || []).reduce((sum, t) => {
      return sum + (parseFloat(t.tax_amount) || 0);
    }, 0);
    const subtotal = totalNum - totalTaxes - tipNum;
    return subtotal > 0 ? subtotal.toFixed(2) : "0.00";
  };

  // Helper function to calculate subtotal from total using tax RATES (not amounts)
  // Formula: Total = Subtotal + (Subtotal * Rate1/100) + (Subtotal * Rate2/100) + Tip
  // Rearranging: Subtotal = (Total - Tip) / (1 + Rate1/100 + Rate2/100)
  const calculateSubtotalFromRates = (total, taxValues, tip) => {
    const totalNum = parseFloat(total) || 0;
    const tipNum = parseFloat(tip) || 0;

    // Calculate sum of all tax rates as decimal (e.g., 10% + 18% = 0.28)
    const totalRateSum = (taxValues || []).reduce((sum, t) => {
      const rate = parseFloat(t.tax_rate) || 0;
      return sum + rate / 100;
    }, 0);

    // Subtotal = (Total - Tip) / (1 + sum of all rates)
    const denominator = 1 + totalRateSum;
    const subtotal = denominator > 0 ? (totalNum - tipNum) / denominator : 0;

    return subtotal > 0 ? subtotal.toFixed(2) : "0.00";
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
  const normalizeMatchKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  // Auto-dismiss error banner after 3.5 s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  // ── Merchant-category intelligence ──────────────────────────────────────────
  // Scans existing receipts to find the most-recently-used expense category for
  // the given merchant. Returns "" when no history is found.
  const getMerchantDefaultCategory = useCallback(
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

  // Handle form field changes with auto-calculation
const handleFieldChange = (field, value) => {
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
  if (field === "subtotal" || field === "purchasePrice" || field === "tip") {
    value = sanitizeMoneyInput(value);
  }
  // Clear error banner when user changes the merchant field
  if (field === "storeName" && error) setError(null);
  setFormData((prev) => {
    const newData = { ...prev, [field]: value };

    if (
      field === "paymentType" ||
      field === "card_issuer_name" ||
      field === "last_4_digit_card" ||
      field === "paymentBrand"
    ) {
      newData.payment_logo_url = "";
      newData.paymentLogoUrl = "";
    }

    // When subtotal changes, recalculate tax amounts based on rates and update total
    if (field === "subtotal") {
      const subtotal = parseFloat(value) || 0;

      // Recalculate tax amounts based on subtotal and tax rates
      if (newData.receipt_tax_values.length > 0) {
        newData.receipt_tax_values = newData.receipt_tax_values.map((t) => {
          const rate = parseFloat(t.tax_rate) || 0;
          const calculatedAmount =
            subtotal > 0 && rate > 0
              ? ((subtotal * rate) / 100).toFixed(2)
              : t.tax_amount;
          return { ...t, tax_amount: calculatedAmount };
        });
      }

      // Auto-calculate total
      newData.purchasePrice = calculateTotal(
        subtotal,
        newData.receipt_tax_values,
        newData.tip,
      );
    }

    // When total changes, recalculate subtotal and tax amounts
    if (field === "purchasePrice") {
      const totalNum = parseFloat(value) || 0;
      const tipNum = parseFloat(newData.tip) || 0;

      // Calculate subtotal from total using tax rates (not amounts)
      // This avoids circular dependency since tax amounts aren't set yet
      const subtotalFromTotal = calculateSubtotalFromRates(
        value,
        newData.receipt_tax_values,
        newData.tip,
      );
      const subtotalNum = parseFloat(subtotalFromTotal) || 0;
      newData.subtotal = subtotalFromTotal;

      // Recalculate tax amounts based on new subtotal so amounts update immediately
      if (newData.receipt_tax_values.length > 0 && subtotalNum > 0) {
        newData.receipt_tax_values = newData.receipt_tax_values.map((t) => {
          const rate = parseFloat(t.tax_rate) || 0;
          const calculatedAmount =
            rate > 0 ? ((subtotalNum * rate) / 100).toFixed(2) : "0.00";
          return { ...t, tax_amount: calculatedAmount };
        });

        // Verify: Total should equal Subtotal + Taxes + Tip
        const recalculatedTotal = calculateTotal(
          subtotalFromTotal,
          newData.receipt_tax_values,
          newData.tip,
        );
        console.log("=== Total Changed Calculation ===");
        console.log("Input Total:", value);
        console.log("Calculated Subtotal:", subtotalFromTotal);
        console.log("Tax Values:", newData.receipt_tax_values);
        console.log("Tip:", newData.tip);
        console.log("Recalculated Total:", recalculatedTotal);
      } else if (newData.receipt_tax_values.length === 0) {
        // No taxes, so subtotal = total - tip
        const subtotalNoTax = (totalNum - tipNum).toFixed(2);
        newData.subtotal = subtotalNoTax;
      }
    }

    // When tip changes, KEEP TOTAL FIXED and recalculate subtotal
    if (field === "tip") {
      const totalNum = parseFloat(newData.purchasePrice) || 0;
      const tipNum = parseFloat(value) || 0;
      
      // Calculate subtotal from total using tax rates (including new tip)
      const subtotalFromTotal = calculateSubtotalFromRates(
        totalNum,
        newData.receipt_tax_values,
        tipNum,
      );
      const subtotalNum = parseFloat(subtotalFromTotal) || 0;
      newData.subtotal = subtotalFromTotal;

      // Recalculate tax amounts based on new subtotal
      if (newData.receipt_tax_values.length > 0 && subtotalNum > 0) {
        newData.receipt_tax_values = newData.receipt_tax_values.map((t) => {
          const rate = parseFloat(t.tax_rate) || 0;
          const calculatedAmount =
            rate > 0 ? ((subtotalNum * rate) / 100).toFixed(2) : "0.00";
          return { ...t, tax_amount: calculatedAmount };
        });
      }

      // Keep purchasePrice (total) unchanged
      newData.purchasePrice = prev.purchasePrice;
    }

    return newData;
  });
};

  // ─── Currency input helpers ───────────────────────────────────────────────
  // Format a raw number string as a display value: "99.78" → "$99.78", "-99.78" → "-$99.78"
  // Returns "" (triggers $0.00 placeholder) for empty/zero values.
  const formatCurrencyDisplay = (val) => {
    if (!val && val !== 0) return "";
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) return "";
    return num < 0
      ? `-$${Math.abs(num).toFixed(2)}`
      : `$${num.toFixed(2)}`;
  };

  // Ensure raw text input always has "$" or "-$" prefix so it can never be fully erased.
  const normalizeCurrencyInput = (raw) => {
    if (!raw) return "$";
    if (raw === "-") return "-$";
    const isNeg = raw.startsWith("-") || raw.startsWith("-$") || raw.startsWith("$-");
    const unsigned = raw.replace(/^-?\$?/, "");
    const cleaned = sanitizeMoneyInput(unsigned);
    if (!cleaned) return isNeg ? "-$" : "$";
    return isNeg ? `-$${cleaned}` : `$${cleaned}`;
  };

  // Parse display string ("$9.78" / "-$9.78") back to a plain number string for formData.
  const parseCurrencyToNumber = (display) => {
    if (!display || display === "$" || display === "-$") return "";
    const isNeg = display.startsWith("-");
    const numPart = display.replace(/^-?\$/, "");
    if (!numPart || numPart === ".") return "";
    const sanitized = sanitizeMoneyInput(numPart);
    return isNeg && sanitized ? `-${sanitized}` : sanitized;
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Add tax type with auto-calculated amount based on current total, keep total fixed
  // Update your addTaxType function to ensure fk_tax_id is set correctly
  const addTaxType = (tax, { silent = false } = {}) => {
    console.log("=== addTaxType START ===");
    console.log("Tax to add:", tax);
    console.log("Current receipt tax values:", formData.receipt_tax_values);

    const exists = formData.receipt_tax_values.some(
      (t) => taxTypesMatch(t, tax),
    );
    console.log("Tax already exists:", exists);

    if (!exists) {
      if (formData.receipt_tax_values.length >= MAX_RECEIPT_TAX_TYPES) {
        if (!silent) {
          setAlertMsg(MAX_RECEIPT_TAX_MSG);
          setShowTaxDropdown(false);
        }
        return;
      }
      // Use current total and tip to compute subtotal, then tax amounts
      const totalNum = parseFloat(formData.purchasePrice) || 0;
      const tipNum = parseFloat(formData.tip) || 0;

      // IMPORTANT: When adding a tax from taxData, ensure fk_tax_id is set to the tax definition ID
      // This links the receipt tax to the tax definition in the tax table
      const taxToAdd = {
        ...tax,
        tax_amount: "0.00",
        // Set fk_tax_id to the tax definition ID (from taxData)
        fk_tax_id: tax.id && tax.id > 0 ? tax.id : tax.fk_tax_id || 0,
        // Ensure id is 0 for new receipt tax entries (will be set by backend)
        id: 0,
      };

      // Sort alphabetically so tax fields always render in A→Z order
      const newTaxValues = [...formData.receipt_tax_values, taxToAdd]
        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""));

      // Recompute subtotal from total using tax rates (not amounts)
      const subtotalFromTotal = calculateSubtotalFromRates(
        totalNum,
        newTaxValues,
        tipNum,
      );
      const subtotalNum = parseFloat(subtotalFromTotal) || 0;

      // Recompute each tax amount based on new subtotal
      // Ensure all required fields are present for saving
      const recalculatedTaxes = newTaxValues.map((t) => {
        const rate = parseFloat(t.tax_rate) || 0;
        const calculatedAmount =
          subtotalNum > 0 && rate > 0
            ? ((subtotalNum * rate) / 100).toFixed(2)
            : "0.00";
        return {
          ...t,
          tax_amount: calculatedAmount,
          // Ensure required fields exist (for saving to backend)
          id: t.id || 0,
          fk_user_id:
            t.fk_user_id || parseInt(localStorage.getItem("fk_user_id")) || 0,
          // IMPORTANT: Preserve fk_tax_id (tax definition ID) - don't override it
          // t.id is the receipt_tax_value id (0 for new entries), not the tax definition id
          fk_tax_id: t.fk_tax_id || 0,
          created: t.created || 0,
          updated: t.updated || 0,
        };
      });

      console.log("Subtotal from total:", subtotalFromTotal);
      console.log("Recalculated taxes:", recalculatedTaxes);

      setFormData((prev) => ({
        ...prev,
        receipt_tax_values: recalculatedTaxes,
        subtotal: subtotalFromTotal,
        // Keep purchasePrice (total) unchanged
        purchasePrice: prev.purchasePrice,
      }));

      console.log("Tax added successfully without changing total");
    } else {
      console.log("Tax already exists, skipping");
    }
    setShowTaxDropdown(false);
    console.log("=== addTaxType END ===");
  };

  // Remove tax type and keep total fixed; recalc subtotal and remaining taxes
  const removeTaxType = (index) => {
    setFormData((prev) => {
      const newTaxValues = prev.receipt_tax_values.filter(
        (_, i) => i !== index,
      );

      const totalNum = parseFloat(prev.purchasePrice) || 0;
      const tipNum = parseFloat(prev.tip) || 0;
      const subtotalFromTotal = calculateSubtotalFromRates(
        totalNum,
        newTaxValues,
        tipNum,
      );
      const subtotalNum = parseFloat(subtotalFromTotal) || 0;

      const recalculatedTaxes = newTaxValues.map((t) => {
        const rate = parseFloat(t.tax_rate) || 0;
        const calculatedAmount =
          subtotalNum > 0 && rate > 0
            ? ((subtotalNum * rate) / 100).toFixed(2)
            : "0.00";
        return {
          ...t,
          tax_amount: calculatedAmount,
          // Ensure required fields exist (for saving to backend)
          id: t.id || 0,
          fk_user_id:
            t.fk_user_id || parseInt(localStorage.getItem("fk_user_id")) || 0,
          // IMPORTANT: Preserve fk_tax_id (tax definition ID) - don't override it
          // t.id is the receipt_tax_value id (0 for new entries), not the tax definition id
          fk_tax_id: t.fk_tax_id || 0,
          created: t.created || 0,
          updated: t.updated || 0,
        };
      });

      return {
        ...prev,
        receipt_tax_values: recalculatedTaxes,
        subtotal: subtotalFromTotal,
        purchasePrice: prev.purchasePrice, // keep total fixed
      };
    });
  };

  // Handle adding new tax type via API
  // Replace your existing handleAddTaxType with this
  // Replace your existing handleAddTaxType with this
  // Replace your existing handleAddTaxType with this
  const handleAddTaxType = async () => {
    console.log("=== handleAddTaxType START ===");
    console.log("Tax Name:", newTaxName);
    console.log("Tax Rate:", newTaxRate);
    console.log("Tax Number:", newTaxNumber);
    console.log("Current step:", step);

    if (isSavingTax) return;

    if (!newTaxName.trim()) {
      setError("Please enter Tax Name");
      return;
    }
    if (!newTaxRate.trim()) {
      setError("Please enter Tax Rate");
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim())) {
      setToast({ isVisible: true, message: "Tax Type already exists", type: "error" });
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setError("Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%).");
      return;
    }
    if (isBlockedTaxRateInput(newTaxRate)) {
      setError("Tax Rate cannot be 99.999 or 999.");
      return;
    }
    if (newTaxName.trim().length > TAX_NAME_MAX) {
      setError(`Tax Name cannot exceed ${TAX_NAME_MAX} characters.`);
      return;
    }
    if (parseFloat(newTaxRate) > TAX_RATE_MAX || parseFloat(newTaxRate) < 0) {
      setError(`Tax Rate must be between 0% and ${TAX_RATE_MAX}%.`);
      return;
    }
    if (newTaxNumber.trim().length > TAX_NUMBER_MAX) {
      setError(`Tax Number cannot exceed ${TAX_NUMBER_MAX} characters.`);
      return;
    }

    setIsSavingTax(true);
    setError(null);

    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || 0;
      console.log("User ID:", fk_user_id);

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

      console.log("Sending tax payload:", taxPayload);

      // Use addTax from DataContext (this calls /tax/addTax endpoint)
      const savedTax = await addTax(taxPayload);
      console.log("Saved tax response:", savedTax);

      // Reset form fields immediately so that during the waits below,
      // the duplicate check doesn't show an inline error banner for the new tax.
      const addedTaxName = newTaxName.trim();
      const addedTaxRate = newTaxRate.trim();
      const addedTaxNumber = newTaxNumber.trim();
      setNewTaxName("");
      setNewTaxRate("");
      clearTaxRateLimitAlert();
      setNewTaxNumber("");
      setTaxNameOverflow(false);
      setTaxNumberOverflow(false);
      setShowAddTaxForm(false);
      setError(null);

      // IMPORTANT: Wait for taxes to be refreshed
      // The addTax function in DataContext already calls fetchTaxes()
      // But we need to wait for the state to update
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Force refresh taxes again to be sure
      await fetchTaxes();

      // Wait a bit more for the state to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Force re-render of tax dropdown
      setTaxDropdownKey((prev) => prev + 1);

      // Create tax object for adding to receipt
      const newTax = {
        tax_name: savedTax.tax_name || addedTaxName,
        tax_rate: savedTax.tax_rate || addedTaxRate,
        tax_amount: "",
        tax_number: savedTax.tax_number || addedTaxNumber || "",
        id: savedTax.id || 0,
        fk_user_id: savedTax.fk_user_id || parseInt(fk_user_id),
      };

      console.log("Form reset, modal closed");
      console.log("=== handleAddTaxType SUCCESS ===");

      // addTax already refreshed taxData — normalize rate for receipt selection
      const normalizedTax = {
        ...newTax,
        tax_rate: formatTaxRate(newTax.tax_rate),
      };

      // Add to receipt only if under per-receipt limit (no alert when saving from Manage Tax Types)
      addTaxType(normalizedTax, { silent: true });
      setToast({ isVisible: true, message: "Tax Type Added", type: "success" });
    } catch (err) {
      console.error("=== handleAddTaxType ERROR ===");
      console.error("Error details:", err);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      setError(err.message || "Failed to add tax type. Please try again.");
    } finally {
      setIsSavingTax(false);
      console.log("=== handleAddTaxType END ===");
    }
  };

  // Handle updating existing tax
  const handleUpdateTax = async () => {
    if (isSavingTax) return;
    if (!editingTaxId || !newTaxName.trim() || !newTaxRate.trim()) {
      setError("Please enter Tax Name and Tax Rate");
      return;
    }
    if (newTaxName.trim().length > TAX_NAME_MAX) {
      setError(`Tax Name cannot exceed ${TAX_NAME_MAX} characters.`);
      return;
    }
    if (parseFloat(newTaxRate) > TAX_RATE_MAX || parseFloat(newTaxRate) < 0) {
      setError(`Tax Rate must be between 0% and ${TAX_RATE_MAX}%.`);
      return;
    }
    if (newTaxNumber.trim().length > TAX_NUMBER_MAX) {
      setError(`Tax Number cannot exceed ${TAX_NUMBER_MAX} characters.`);
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim(), editingTaxId)) {
      setToast({ isVisible: true, message: "Tax Type already exists", type: "error" });
      return;
    }
    if (isBlockedTaxRateInput(newTaxRate)) {
      setError("Tax Rate cannot be 99.999 or 999.");
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setError("Tax Rate can have a maximum of 3 decimal places.");
      return;
    }
    const cleanRate = String(newTaxRate).replace(/%/g, "").trim();
    const existingTaxForRateCheck = taxData.find((t) => t.id === editingTaxId);
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
    setError(null);

    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || 0;
      const existingTax = taxData.find((t) => t.id === editingTaxId);

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
        udpated: 0,
      };

      await updateTax(taxPayload);
      await propagateTaxNameChangeToReceipts({
        receipts,
        taxId: editingTaxId,
        oldName: existingTax?.tax_name,
        newName: newTaxName.trim(),
        updateReceipt,
      });

      setNewTaxName("");
      setNewTaxRate("");
      clearTaxRateLimitAlert();
      setNewTaxNumber("");
      setTaxNameOverflow(false);
      setTaxNumberOverflow(false);
      setEditingTaxId(null);
      setShowAddTaxForm(false);
      setError(null);
      setToast({ isVisible: true, message: "Tax Type Updated", type: "success" });
    } catch (err) {
      setError(err.message || "Failed to update tax type. Please try again.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleAddNewTaxTypeFromRateWarning = () => {
    if (!pendingTaxUpdate) return;
    const existingTax = taxData.find((t) => t.id === editingTaxId);
    const baseName = existingTax?.tax_name || pendingTaxUpdate.newName;
    const incremented = buildIncrementedTaxName(
      baseName,
      allTaxTypes.map((t) => t.tax_name),
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
    setError(null);
  };

  const confirmTaxRateChange = async () => {
    if (isSavingTax || !pendingTaxUpdate || !editingTaxId) return;
    setShowTaxRateChangeWarning(false);
    const { newName, newRate, newNumber } = pendingTaxUpdate;
    setPendingTaxUpdate(null);
    setIsSavingTax(true);
    setError(null);
    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || 0;
      const existingTax = taxData.find((t) => t.id === editingTaxId);
      await propagateTaxRateChangeToReceipts({
        receipts,
        taxId: editingTaxId,
        oldRate: existingTax?.tax_rate,
        oldName: existingTax?.tax_name,
        updateReceipt,
      });
      await updateTax({
        id: editingTaxId,
        fk_user_id: parseInt(fk_user_id),
        tax_name: newName,
        tax_rate: newRate,
        tax_number: newNumber || "",
        is_default_tax: parseInt(existingTax?.is_default_tax) || 0,
        is_tips: parseInt(existingTax?.is_tips) || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: 0,
      });
      if (
        (newName || "").trim().toLowerCase() !==
        (existingTax?.tax_name || "").trim().toLowerCase()
      ) {
        await propagateTaxNameChangeToReceipts({
          receipts,
          taxId: editingTaxId,
          oldName: existingTax?.tax_name,
          newName,
          updateReceipt,
        });
      }
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setEditingTaxId(null);
      clearTaxRateLimitAlert();
      setTaxNameOverflow(false);
      setTaxNumberOverflow(false);
      setShowAddTaxForm(false);
      setError(null);
      setToast({ isVisible: true, message: "Tax Type Updated", type: "success" });
    } catch (err) {
      setError(err.message || "Failed to update tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  // Handle deleting tax
  const handleDeleteTax = async (taxId) => {
    if (!window.confirm("Are you sure you want to delete this tax type?")) {
      return;
    }

    setIsDeletingTax(true);
    setError(null);

    try {
      await deleteTax(taxId);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to delete tax type. Please try again.");
    } finally {
      setIsDeletingTax(false);
    }
  };

  // Handle editing tax - populate form with tax data
  const handleEditTax = (tax) => {
    setEditingTaxId(tax.id);
    setNewTaxName(tax.tax_name || "");
    // Normalize stored rate (e.g. backend may persist "6.5000") so the input shows
    // "6.5" rather than "6.5000"/"6.500" and doesn't trigger the >3-decimal banner.
    const rawRate = tax.tax_rate;
    setNewTaxRate(rawRate === undefined || rawRate === null || rawRate === "" ? "" : formatTaxRate(rawRate));
    setNewTaxNumber(tax.tax_number || "");
    clearTaxRateLimitAlert();
    setTaxNameOverflow(false);
    setTaxNumberOverflow(false);
    setShowAddTaxForm(true);
    setError(null);
  };

  // Handle cancel edit - reset form
  const handleCancelEdit = () => {
    setEditingTaxId(null);
    setNewTaxName("");
    setNewTaxRate("");
    setNewTaxNumber("");
    clearTaxRateLimitAlert();
    setTaxNameOverflow(false);
    setTaxNumberOverflow(false);
    setError(null);
  };

  const closeTaxModal = () => {
    setShowManageTaxModal(false);
    setShowAddTaxForm(false);
    setTaxRateFocused(false);
    setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber("");
    clearTaxRateLimitAlert();
    setTaxNameOverflow(false); setTaxNumberOverflow(false);
    setEditingTaxId(null);
    setError(null);
  };

  // Update tax amount and keep total fixed; recalc subtotal and taxes
  const updateTaxAmount = (index, amount) => {
    setFormData((prev) => {
      const newTaxValues = prev.receipt_tax_values.map((t, i) =>
        i === index ? { ...t, tax_amount: amount } : t,
      );

      const totalNum = parseFloat(prev.purchasePrice) || 0;
      const tipNum = parseFloat(prev.tip) || 0;
      const subtotalFromTotal = calculateSubtotalFromRates(
        totalNum,
        newTaxValues,
        tipNum,
      );
      const subtotalNum = parseFloat(subtotalFromTotal) || 0;

      const recalculatedTaxes = newTaxValues.map((t) => {
        const rate = parseFloat(t.tax_rate) || 0;
        const calculatedAmount =
          subtotalNum > 0 && rate > 0
            ? ((subtotalNum * rate) / 100).toFixed(2)
            : "0.00";
        return {
          ...t,
          tax_amount: calculatedAmount,
          // Ensure required fields exist (for saving to backend)
          id: t.id || 0,
          fk_user_id:
            t.fk_user_id || parseInt(localStorage.getItem("fk_user_id")) || 0,
          // IMPORTANT: Preserve fk_tax_id (tax definition ID) - don't override it
          // t.id is the receipt_tax_value id (0 for new entries), not the tax definition id
          fk_tax_id: t.fk_tax_id || 0,
          created: t.created || 0,
          updated: t.updated || 0,
        };
      });

      return {
        ...prev,
        receipt_tax_values: recalculatedTaxes,
        subtotal: subtotalFromTotal,
        purchasePrice: prev.purchasePrice, // keep total fixed
      };
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setIsParsing(true);
    setParsedData(null);
    // Start each upload session with a clean media state.
    resetReceiptMediaState({ clearFiles: false });

    try {
      const token = localStorage.getItem("token");
      const file = files[0];

      // ─── STEP 1: Upload media files to /user/uploadmediaV1 ───────────────
      let mediaUrls = [];
      try {
        console.log("Uploading files to uploadmediaV1...");
        setUploadProgress(10);
        mediaUrls = await uploadFilesToMedia(files); // upload ALL selected files
        // Deduplicate to prevent same image appearing twice
        mediaUrls = [...new Set(mediaUrls.filter(Boolean))];
        setUploadedMediaUrls(mediaUrls);
        console.log("Media URLs from uploadmediaV1:", mediaUrls);
        setUploadProgress(30);
      } catch (mediaErr) {
        console.error("uploadmediaV1 failed:", mediaErr);
        // Non-fatal: continue without pre-uploaded URL, fall back to direct upload
      }

      // ─── STEP 2: Parse receipt for OCR data ──────────────────────────────
      let parsedReceiptData = null;
      try {
        console.log("Starting receipt parsing...");
        parsedReceiptData = await parseReceipt(file, allMerchantsWithImages);
        setParsedData(parsedReceiptData);
        console.log("Receipt parsed successfully:", parsedReceiptData);
      } catch (parseError) {
        console.error("Receipt parsing failed:", parseError);
        if (parseError.message && parseError.message.includes("PDF")) {
          setError(
            `PDF processing error: ${parseError.message}. Please try converting the PDF to an image first.`,
          );
        } else {
          console.warn("Receipt parsing failed, continuing:", parseError);
        }
      } finally {
        setIsParsing(false);
      }

      setUploadProgress(50);

      // ─── STEP 3: Store local file for preview ────────────────────────────
      // NOTE: We do NOT call addReceiptv1 here. The receipt is created once in
      // handleSaveReceipt with the full form data, avoiding duplicate entries.
      setLocalImageFile(file);

      // Generate PDF preview if needed
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        await generatePdfPreview(file);
      }

      setUploadProgress(80);

      // ─── STEP 4: Determine image URL ─────────────────────────────────────
      // Priority: uploadmediaV1 URL > local object URL (preview only)
      const primaryRemoteMediaUrl = nonEmptyUrl(mediaUrls[0]) || null;
      const imageUrl =
        primaryRemoteMediaUrl ||
        URL.createObjectURL(file);

      setUploadedImageUrl(imageUrl);

      // Store a minimal receipt-data stub (no id → 0) so handleSaveReceipt knows
      // this is a brand-new receipt and calls addReceiptv1 exactly once.
      setUploadedReceiptData({
        id: 0,
        // Keep backend payload URL-only; blob: URLs are preview-only and can trigger
        // server-side "Invalid URL" validation errors.
        receipt_image: normalizeMediaUrl(primaryRemoteMediaUrl || "0"),
        emailAttachment: normalizeMediaUrl(primaryRemoteMediaUrl || "0"),
      });

      setUploadProgress(100);

      // ─── STEP 5: Pre-fill form with OCR + parsed data ─────────────────────
      let parsedDate = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();

      if (parsedReceiptData?.purchaseDate) {
        parsedDate = parsedReceiptData.purchaseDate;
      }

      const merchantName = parsedReceiptData?.merchantName || "Miscellaneous";

      let merchantLogo = parsedReceiptData?.merchantLogo || null;
      if (!merchantLogo && merchantName) {
        const existingMerchant = allMerchantsWithImages.find(
          (m) => m.name?.toLowerCase() === merchantName.toLowerCase(),
        );
        merchantLogo = existingMerchant?.image || null;
      }

      if (parsedReceiptData?.merchantLogo) {
        setDetectedMerchantLogo(parsedReceiptData.merchantLogo);
      }

      const cleanPaymentType = parsedReceiptData?.paymentMethod || "";

      const cleanNumericValue = (value) => {
        if (!value) return "";
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return "";
        return value.toString();
      };

      // OCR-detected category takes priority; fall back to merchant receipt history
      const ocrCategory = cleanTextValue(parsedReceiptData?.category || "");
      const autoCategory = ocrCategory || getMerchantDefaultCategory(merchantName);

      setFormData((prev) => ({
        ...prev,
        storeName: merchantName,
        expense_type: autoCategory,
        paymentType: cleanPaymentType,
        card_issuer_name: "",
        last_4_digit_card: "",
        product_date: parsedDate,
        subtotal: cleanNumericValue(parsedReceiptData?.subtotal),
        purchasePrice: cleanNumericValue(parsedReceiptData?.total || parsedReceiptData?.subtotal),
        product_name: cleanTextValue(parsedReceiptData?.productName || ""),
        notes: "",
        receipt_tax_values: defaultTaxIds.map(id => {
          const taxType = taxData?.find(t => t.id === id);
          if (taxType) {
            return { fk_tax_id: taxType.id, tax_name: taxType.tax_name, tax_rate: taxType.tax_rate, tax_amount: "" };
          }
          return null;
        }).filter(Boolean),
        tip: cleanNumericValue(parsedReceiptData?.tip),
      }));

      setStep("form");
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload receipts. Please try again.");
    } finally {
      setIsUploading(false);
      setIsParsing(false);
    }
  };

  // Allow manual receipt entry without uploading an image first.
  const handleSkipUpload = () => {
    if (isUploading || isParsing) return;
    setError(null);
    setFiles([]);
    setUploadedMediaUrls([]);
    setUploadedImageUrl(null);
    setUploadedReceiptData(null);
    setLocalImageFile(null);
    setPdfPreviewUrl(null);

    // Apply default taxes
    const defaultTaxes = defaultTaxIds.map(id => {
      const taxType = taxData?.find(t => t.id === id);
      if (taxType) {
        return {
          fk_tax_id: taxType.id,
          tax_name: taxType.tax_name,
          tax_rate: taxType.tax_rate,
          tax_amount: "",
        };
      }
      return null;
    }).filter(Boolean);

    setFormData(prev => ({
      ...prev,
      receipt_tax_values: defaultTaxes
    }));

    setStep("form");
  };

  // ── Expense Category edit/delete helpers ────────────────────────────────

  const handleOpenEditCategory = (category) => {
    setEditingCategory(category);
    setEditCategoryName(category);
    setEditCategoryError(null);
    setShowEditCategoryModal(true);
    setShowCategoryDropdown(false);
  };

  // Validate only — shows confirmation popup; actual save is in doConfirmCategoryEdit
  const handleSaveEditCategory = () => {
    const newName = editCategoryName.trim();
    if (!newName) { setEditCategoryError("Please enter Expense Category"); return; }
    if (expenseCategoryExists(newName, editingCategory)) {
      setEditCategoryError("Expense Category already exists");
      return;
    }
    // Validation passed — show styled confirmation popup
    setShowCategoryEditConfirm(true);
  };

  // Called when user taps "Okay" in the expense category edit confirmation popup
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
        await putUpdateReceipt({ ...r, expense_type: newName });
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
      if ((formData.expense_type || "").toLowerCase() === oldName.toLowerCase()) {
        handleFieldChange("expense_type", newName);
      }
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
        await putUpdateReceipt({ ...r, expense_type: "" });
      }
      if ((formData.expense_type || "").toLowerCase() === deletingCategory.toLowerCase()) {
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
      setToast({ isVisible: true, message: "Expense Category Deleted", type: "success" });
    } catch (err) {
      setToast({ isVisible: true, message: err.message || "Failed to delete category.", type: "error" });
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // Save the complete receipt with all form data
  const handleSaveReceipt = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    console.log("=== SAVE RECEIPT CLICKED ===");
    console.log("Form Data State:", JSON.stringify(formData, null, 2));
    console.log("Tags State:", JSON.stringify(tags, null, 2));
    console.log(
      "Uploaded Receipt Data:",
      JSON.stringify(uploadedReceiptData, null, 2),
    );
    console.log("Uploaded Image URL:", uploadedImageUrl);

    try {
      const token = localStorage.getItem("token");

      // Convert tags to receipt_tag string format
      const receiptTag = [
        tags.locked ? "1" : "0",
        tags.starred ? "1" : "0",
        tags.flagged ? "1" : "0",
        tags.verified ? "1" : "0",
        tags.reconciled ? "1" : "0",
        tags.reimbursed ? "1" : "0",
        tags.warrantied ? "1" : "0",
      ].join(",");

      // Build payload matching API model structure
      // Validate date - ensure it's valid and not empty
      let productDate = 0;
      if (formData.product_date) {
        const [yr, mo, dy] = formData.product_date.split("-").map(Number);
        const dateObj = new Date(Date.UTC(yr, mo - 1, dy));
        if (!isNaN(dateObj.getTime())) {
          productDate = Math.floor(dateObj.getTime() / 1000);
        }
      }

      // If date is still invalid, use current date
      if (productDate === 0 || productDate < 1000000) {
        productDate = Math.floor(new Date().getTime() / 1000);
      }

      const purchasePrice = parseFloat(formData.purchasePrice) || 0;
      const tipAmount = parseFloat(formData.tip) || 0;
      const subtotal = parseFloat(formData.subtotal) || 0;

      // Only merchant name is mandatory (date is always set to today if empty)
      const hasStoreName =
        formData.storeName && formData.storeName.trim() !== "";

      if (!hasStoreName) {
        setError("Merchant name is required. Please select or enter a merchant before saving.");
        setIsSaving(false);
        return;
      }
      if (containsEmoji(formData.storeName)) {
        setAlertMsg("Emojis are not allowed in merchant names. Please use plain text.");
        setIsSaving(false);
        return;
      }

      // Build receipt_tax_values array including tip if present
      console.log("=== Building receipt_tax_values payload ===");
      console.log("formData.receipt_tax_values:", formData.receipt_tax_values);
      console.log(
        "uploadedReceiptData?.receipt_tax_values:",
        uploadedReceiptData?.receipt_tax_values,
      );
      console.log(
        "Number of tax values in formData:",
        formData.receipt_tax_values.length,
      );

      // Use formData.receipt_tax_values first, fallback to uploadedReceiptData if empty
      const taxValuesToUse =
        formData.receipt_tax_values.length > 0
          ? formData.receipt_tax_values
          : uploadedReceiptData?.receipt_tax_values || [];

      console.log("Tax values to use:", taxValuesToUse);
      console.log("Number of tax values to use:", taxValuesToUse.length);

      // Filter out tip entries (tip is handled separately)
      const nonTipTaxValues = taxValuesToUse.filter(
        (t) => !(t.tax_name || "").toLowerCase().includes("tip"),
      );

      // AddReceiptModal must always create a new receipt record. Never link taxes
      // to a prior receipt ID, even if stale state accidentally exists.
      const taxReceiptId = 0;

      let receiptTaxValuesPayload = nonTipTaxValues.map((t, index) => {
        const taxPayload = {
          id: parseInt(t.id) || 0, // Receipt tax value id (0 for new entries)
          fk_user_id:
            parseInt(t.fk_user_id) ||
            parseInt(localStorage.getItem("fk_user_id")) ||
            0,
          fk_receipt_id: taxReceiptId, // Use uploaded receipt ID if available, else 0 (backend sets it)
          // IMPORTANT: fk_tax_id should be the tax definition ID from taxData
          // This links the receipt tax to the tax definition in the tax table
          // When saving, fk_tax_id should already be set from when tax was added (via addTaxType)
          fk_tax_id: parseInt(t.fk_tax_id) || 0,
          tax_name: t.tax_name || "",
          tax_rate: t.tax_rate || "0",
          tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
          created: parseInt(t.created) || 0,
          updated: parseInt(t.updated) || 0,
        };
        console.log(`Tax ${index}:`, taxPayload);
        return taxPayload;
      });

      console.log(
        "Final receiptTaxValuesPayload (before tip):",
        receiptTaxValuesPayload,
      );

      // Add tip as a tax entry if tip amount is provided
      if (tipAmount > 0) {
        const tipPercentage =
          subtotal > 0 ? Math.round((tipAmount / subtotal) * 100) : 0;

        // Try to align tip structure with existing tax records so backend & mobile app treat it the same
        // 1) Prefer an existing "Tip" tax definition from receiptTaxValues (global tax types)
        let baseTipTax = null;
        if (Array.isArray(taxData) && taxData.length > 0) {
          baseTipTax = taxData.find((t) =>
            (t.tax_name || "").toString().toLowerCase().includes("tip"),
          );
        }

        const fkUserId = parseInt(localStorage.getItem("fk_user_id")) || 0;

        const tipTaxPayload = {
          // Reuse id/fk_tax_id from a known "Tip" tax record when possible so mobile app recognizes it
          id: baseTipTax ? parseInt(baseTipTax.id) || 0 : 0,
          fk_user_id: fkUserId,
          fk_receipt_id: 0, // Always 0 for new receipts - backend will set it when creating via addReceiptv1
          fk_tax_id: baseTipTax
            ? parseInt(baseTipTax.fk_tax_id) || parseInt(baseTipTax.id) || 0
            : 0,
          tax_name: (baseTipTax?.tax_name || "Tip").toString(),
          tax_rate: tipPercentage.toString(),
          tax_amount: tipAmount.toString(),
          created: baseTipTax ? parseInt(baseTipTax.created) || 0 : 0,
          updated: baseTipTax ? parseInt(baseTipTax.updated) || 0 : 0,
        };

        console.log("Tip tax payload to save:", tipTaxPayload);
        receiptTaxValuesPayload.push(tipTaxPayload);
      }

      // Determine card_issuer_name and paymentType
      // Check if payment method was added via Add Payment Method modal
      // Use a more flexible comparison to handle potential whitespace differences
      const addedPaymentMethod = localPaymentMethods.find((pm) => {
        const pmType = (pm.paymentType || "").toString().trim();
        const formType = (formData.paymentType || "").toString().trim();
        return pmType === formType;
      });

      let paymentType =
        formData.paymentType || uploadedReceiptData?.paymentType || "";
      let cardIssuerName = "";
      let last4 = "";
      let paymentCategoryType = parseInt(formData.receipt_category) || 0;

      // If payment method was added via modal, use its data (PRIORITY - don't override)
      if (addedPaymentMethod) {
        console.log(
          "Using payment method from localPaymentMethods:",
          addedPaymentMethod,
        );
        // Extract base payment type (without *last4) for API
        const basePaymentType = (addedPaymentMethod.paymentType || "")
          .replace(/\s*\*\d{3,4}$/, "")
          .trim();

        // IMPORTANT: Use selectedCardType for paymentType if available (for logo detection)
        // paymentType should be the card type (e.g., "Diners Club") for correct logo
        // card_issuer_name should be the custom name (e.g., "Omi") for display
        if (addedPaymentMethod.selectedCardType) {
          paymentType = addedPaymentMethod.selectedCardType; // Use card type for logo (e.g., "Diners Club")
        } else {
          paymentType = basePaymentType; // Fallback to paymentType string
        }

        // card_issuer_name is for display - use custom name if entered, otherwise use card type
        cardIssuerName =
          addedPaymentMethod.cardIssuerName ||
          addedPaymentMethod.selectedCardType ||
          "";

        last4 = addedPaymentMethod.last4DigitCard || "";
        // Set payment category type from added payment method
        if (addedPaymentMethod.paymentCategoryType === "Business") {
          paymentCategoryType = 1;
        } else if (addedPaymentMethod.paymentCategoryType === "Personal") {
          paymentCategoryType = 0;
        }
      } else {
        console.log(
          "Payment method NOT found in localPaymentMethods. formData.paymentType:",
          formData.paymentType,
          "localPaymentMethods:",
          localPaymentMethods,
        );

        // ── STEP A: Extract last4 and strip *last4 from paymentType ──────────
        // Always do this regardless of whether formData already has card_issuer_name,
        // because paymentType from the dropdown can be "Diners Club *4545" etc.
        if (paymentType && paymentType.includes("*")) {
          const match = paymentType.match(/\*(\d{3,4})$/);
          if (match && match[1] && match[1] !== "0") {
            last4 = match[1]; // e.g. "4545"
          }
          // Strip *last4 → "Diners Club"
          paymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
        }

        // Clean up invalid paymentType values like "0", "0*0"
        if (
          paymentType === "0" ||
          paymentType === "0*0" ||
          /^0\*\d*$/.test(paymentType)
        ) {
          paymentType = "";
        }

        // ── STEP B: Derive cardIssuerName from the clean paymentType ─────────
        // Re-derive from the card-brand table so we always get the full correct name
        // (e.g. "Diners Club", not "Club").
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
          // Not a known brand → use the raw name as-is (custom issuer)
          return pt;
        };

        // If the user manually typed a custom issuer name in formData, honour it.
        // Otherwise always re-derive from paymentType for accuracy.
        const formIssuer = (formData.card_issuer_name || "").trim();
        const derivedIssuer = resolveIssuerName(paymentType);

        // Use formIssuer only when it's a genuinely custom name (i.e. NOT just a
        // stale/wrong OCR value that duplicates what paymentType already says).
        if (formIssuer && formIssuer.toLowerCase() !== derivedIssuer.toLowerCase()) {
          cardIssuerName = formIssuer;
        } else {
          cardIssuerName = derivedIssuer;
        }

        // ── STEP C: last4 fallback from formData ──────────────────────────────
        if (!last4 || last4 === "0") {
          const fd4 = (formData.last_4_digit_card || "").trim();
          if (fd4 && fd4 !== "0" && /^\d{3,4}$/.test(fd4)) last4 = fd4;
        }

        // ── STEP D: Generic card fallback ─────────────────────────────────────
        if (last4 && !cardIssuerName) {
          paymentType = "Card";
          cardIssuerName = "Card";
        }
      }

      // Final validation: ensure last4 is not "0"
      if (last4 === "0") {
        last4 = "";
      }

      // Final validation: ensure cardIssuerName is not empty if we have paymentType
      if (!cardIssuerName && paymentType) {
        cardIssuerName = paymentType;
      }

      // finalPaymentType = cleaned paymentType (no *last4, correct brand name)
      const finalPaymentType = paymentType;

      // Get store_image from selected merchant if available
      const selectedMerchantImage = getMerchantImage(formData.storeName);
      const shouldUseDetectedLogo =
        detectedMerchantLogo &&
        formData.storeName?.toLowerCase() ===
          (uploadedReceiptData?.storeName || "").toLowerCase();
      const storeImageToSave =
        selectedMerchantImage ||
        (shouldUseDetectedLogo ? detectedMerchantLogo : null) ||
        uploadedReceiptData?.store_image ||
        "";

      // Safety guard: AddReceiptModal is create-only. Force id=0 so we never update
      // an older receipt due to stale in-memory state after navigation/login flows.
      const uploadedId = 0;
      const fkUserId = parseInt(localStorage.getItem("fk_user_id")) || 0;
      const combinedImageUrls = buildCombinedMediaField([
        uploadedMediaUrls,
        uploadedImageUrl,
        uploadedReceiptData?.receipt_image,
        uploadedReceiptData?.emailAttachment,
      ]);
      const savePayload = {
        id: uploadedId, // Always 0 in Add flow (create-only)
        fk_user_id: fkUserId,
        storeName: formData.storeName || "",
        product_name: formData.product_name || "",
        emailAttachment: combinedImageUrls,
        purchasePrice: purchasePrice.toString(),
        total_amount: purchasePrice.toString(),
        payment_category_type: paymentCategoryType,
        status: parseInt(uploadedReceiptData?.status) || 0,
        paymentType: finalPaymentType || "", // Use cleaned paymentType for logo detection
        last_4_digit_card: last4 || "", // Use validated last4 (empty string if invalid, matching mobile format)
        card_issuer_name: cardIssuerName || "",
        fk_original_receipt_id:
          uploadedReceiptData?.fk_original_receipt_id || "0",
        fk_forward_from_receipt_id:
          uploadedReceiptData?.fk_forward_from_receipt_id || "0",
        receipt_category: parseInt(formData.receipt_category) || 0,
        product_date: productDate,
        expense_type: formData.expense_type || "",
        // Mobile always stores images in emailAttachment; receipt_image stays "0".
        // Matching that pattern keeps QuickBooks and display logic consistent.
        receipt_image: "0",
        store_image:
          getMerchantImage(formData.storeName) ||
          detectedMerchantLogo ||
          uploadedReceiptData?.store_image ||
          "",
        notes: formData.notes || "",
        receipt_forwarded: uploadedReceiptData?.receipt_forwarded || "0",
        receipt_tag: receiptTag,
        create_date: uploadedReceiptData?.create_date || "",
        receipt_tax_values: receiptTaxValuesPayload,
      };

      console.log("=== ENTIRE RECEIPT DATA ON SAVE ===");
      console.log(
        "Full Receipt Payload:",
        JSON.stringify(savePayload, null, 2),
      );
      console.log("=== Receipt Details ===");
      console.log("ID:", savePayload.id);
      console.log("Store Name:", savePayload.storeName);
      console.log("Product Name:", savePayload.product_name);
      console.log("Purchase Price:", savePayload.purchasePrice);
      console.log("Total Amount:", savePayload.total_amount);
      console.log(
        "Product Date:",
        savePayload.product_date,
        "(timestamp:",
        new Date(savePayload.product_date * 1000).toISOString(),
        ")",
      );
      console.log("=== Payment Method Details ===");
      console.log("paymentType (for logo):", savePayload.paymentType);
      console.log(
        "card_issuer_name (for display):",
        savePayload.card_issuer_name,
      );
      console.log("last_4_digit_card:", savePayload.last_4_digit_card);
      console.log("Original paymentType variable:", paymentType);
      console.log("Original cardIssuerName variable:", cardIssuerName);
      console.log("Expense Type:", savePayload.expense_type);
      console.log(
        "Receipt Category:",
        savePayload.receipt_category,
        "(0=Personal, 1=Business)",
      );
      console.log("=== Payment Method Details ===");
      console.log("Payment Type:", savePayload.paymentType);
      console.log("Card Issuer Name:", savePayload.card_issuer_name);
      console.log("Last 4 Digits:", savePayload.last_4_digit_card);
      console.log("Payment Category Type:", savePayload.payment_category_type);
      console.log("=== Images ===");
      console.log("Receipt Image:", savePayload.receipt_image);
      console.log("Email Attachment:", savePayload.emailAttachment);
      console.log("Store Image:", savePayload.store_image);
      console.log("=== Tax Values ===");
      console.log(
        "Number of Tax Values:",
        savePayload.receipt_tax_values.length,
      );
      console.log("Tax Values Array:", savePayload.receipt_tax_values);
      savePayload.receipt_tax_values.forEach((tax, index) => {
        console.log(`  Tax ${index + 1}:`, {
          tax_name: tax.tax_name,
          tax_amount: tax.tax_amount,
          tax_rate: tax.tax_rate,
        });
      });
      console.log("=== Tags ===");
      console.log("Receipt Tag:", savePayload.receipt_tag);
      console.log("=== Other Fields ===");
      console.log("Notes:", savePayload.notes);
      console.log("Status:", savePayload.status);
      console.log("Receipt Forwarded:", savePayload.receipt_forwarded);
      console.log("Create Date:", savePayload.create_date);
      console.log(
        "FK Original Receipt ID:",
        savePayload.fk_original_receipt_id,
      );
      console.log(
        "FK Forward From Receipt ID:",
        savePayload.fk_forward_from_receipt_id,
      );
      console.log("=== Form Data (for reference) ===");
      console.log("Form Data:", JSON.stringify(formData, null, 2));
      console.log("=== Uploaded Receipt Data (for reference) ===");
      console.log(
        "Uploaded Receipt Data:",
        JSON.stringify(uploadedReceiptData, null, 2),
      );
      console.log("=== END OF RECEIPT DATA ===");

      // Determine if this is a new receipt or an update.
      // If an image was uploaded, the backend already created a receipt (addReceiptv1 was called
      // in handleFileUpload) and returned an ID stored in uploadedReceiptData.id.
      // In that case savePayload.id is that uploaded ID → we UPDATE the existing receipt.
      // If no image was uploaded (manual entry), savePayload.id is 0 → we CREATE a new receipt.
      const receiptId = parseInt(savePayload.id) || 0;
      const isNewReceipt = receiptId === 0;

      console.log("=== Receipt Save Decision ===");
      console.log("savePayload.id:", savePayload.id);
      console.log("receiptId (parsed):", receiptId);
      console.log("uploadedReceiptData?.id:", uploadedReceiptData?.id);
      console.log("isNewReceipt:", isNewReceipt);
      console.log(
        "Will use endpoint:",
        isNewReceipt ? "addReceiptv1" : "updateReceiptv1",
      );

      // Update receipt if we have a valid ID - try multiple possible *update* endpoints
      // IMPORTANT: Only call update endpoints if receiptId > 0 (existing receipt)
      if (!isNewReceipt && receiptId > 0) {
        const editEndpoints = [
          "/api/receipt/updateReceiptv1",
          "/api/receipt/editReceiptv1",
          "/api/receipt/updateReceipt",
          "/api/receipt/editReceipt",
        ];

        let updateSuccess = false;
        for (const endpoint of editEndpoints) {
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accesstoken: token,
              },
              body: JSON.stringify(savePayload),
            });

            if (response.ok) {
              const rawUpdate = await response.text();
              let updateData = {};
              try { updateData = JSON.parse(rawUpdate); } catch { /* non-JSON 200 OK is fine */ }
              console.log(`=== API RESPONSE - Receipt Updated Successfully via ${endpoint} ===`);
              console.log("Full Update Response:", rawUpdate);
              updateSuccess = true;
              break;
            }
            const errorText = await response.text();
            console.log(
              `${endpoint} returned ${response.status}, trying next...`,
            );
            console.log("Error Response:", errorText);
          } catch (updateErr) {
            console.log(
              `${endpoint} failed: ${updateErr.message}, trying next...`,
            );
          }
        }

        if (!updateSuccess) {
          console.warn("All update endpoints failed. Data saved locally only.");
        }
      } else if (isNewReceipt) {
        // New receipt - create via API
        console.log("Creating new receipt via addReceiptv1 API");
        console.log(
          "savePayload.id:",
          savePayload.id,
          "isNewReceipt:",
          isNewReceipt,
        );
        try {
          const createResponse = await fetch("/api/receipt/addReceiptv1", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accesstoken: token,
            },
            body: JSON.stringify(savePayload),
          });

          if (createResponse.ok) {
            const rawText = await createResponse.text();
            let createdData = {};
            try {
              createdData = JSON.parse(rawText);
            } catch {
              // Backend returned HTTP 200 with non-JSON body (e.g. "Invalid query").
              // Log it and continue — the receipt may still have been created.
              console.warn("addReceiptv1 non-JSON response:", rawText);
              if (/^Invalid\s/i.test(rawText.trim())) {
                throw new Error(rawText.trim());
              }
            }
            console.log("=== API RESPONSE - Receipt Created Successfully ===");
            console.log("Full API Response:", rawText);
            console.log(
              "Created Receipt ID:",
              createdData?.id || createdData?.receipt?.id || createdData?.data?.id,
            );
            // Update savePayload with the created receipt ID if returned
            const newId = createdData?.id || createdData?.receipt?.id || createdData?.data?.id;
            if (newId) savePayload.id = newId;
          } else {
            const errorText = await createResponse.text();
            console.error("=== API ERROR - Failed to create receipt ===");
            console.error("Error Status:", createResponse.status);
            console.error("Error Response:", errorText);
            throw new Error(
              `Failed to create receipt: ${createResponse.status} — ${errorText}`,
            );
          }
        } catch (createErr) {
          console.error("Error creating receipt:", createErr);
          throw createErr;
        }
      }

      // If user entered a custom expense category, add it to context immediately so it
      // shows up in Filter → Expense Category without waiting for a full data refresh.
      if (formData.expense_type && formData.expense_type.trim()) {
        addExpenseCategory(formData.expense_type.trim());
      }

      // Refresh data from backend to get the newly created/updated receipt with all fields
      // This ensures payment method logos and all other data are correctly loaded
      // The onReceiptAdded callback will trigger refreshData() in HomePage
      if (onReceiptAdded) {
        onReceiptAdded({
          ...savePayload,
          receipt_image: buildCombinedMediaField([
            savePayload.receipt_image,
            savePayload.emailAttachment,
            uploadedMediaUrls,
            uploadedImageUrl,
            uploadedReceiptData?.receipt_image,
            uploadedReceiptData?.emailAttachment,
          ]),
        });
      } else {
        // If no callback, we still need to refresh data
        // But we can't call refreshData directly here, so just close modal
        // The parent component should handle refresh
        console.log(
          "No onReceiptAdded callback - parent should handle data refresh",
        );
      }

      // Clear transient media/upload state before closing.
      resetReceiptMediaState();

      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save receipt. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Duplicate helpers ─────────────────────────────────────────────────────

  /** Build a minimal receipt API payload from current form state */
  const buildQuickPayload = (overrideId = null) => {
    let productDate = 0;
    if (formData.product_date) {
      const [yr, mo, dy] = formData.product_date.split("-").map(Number);
      const d = new Date(Date.UTC(yr, mo - 1, dy));
      if (!isNaN(d.getTime())) productDate = Math.floor(d.getTime() / 1000);
    }
    if (!productDate) productDate = Math.floor(Date.now() / 1000);

    const receiptTag = [
      "0",
      tags.starred ? "1" : "0",
      tags.flagged ? "1" : "0",
      tags.verified ? "1" : "0",
      tags.reconciled ? "1" : "0",
      tags.reimbursed ? "1" : "0",
      tags.warrantied ? "1" : "0",
    ].join(",");

    const fkUserId = parseInt(localStorage.getItem("fk_user_id")) || 0;
    // Add flow should never inherit/patch an existing receipt id.
    const baseId = overrideId !== null ? overrideId : 0;
    const combinedImageUrls = buildCombinedMediaField([
      uploadedMediaUrls,
      uploadedImageUrl,
      uploadedReceiptData?.receipt_image,
      uploadedReceiptData?.emailAttachment,
    ]);

    return {
      id: baseId,
      storeName: formData.storeName || "",
      product_name: formData.product_name || "",
      emailAttachment: combinedImageUrls,
      purchasePrice: (parseFloat(formData.purchasePrice) || 0).toString(),
      total_amount: (parseFloat(formData.purchasePrice) || 0).toString(),
      payment_category_type: parseInt(formData.receipt_category) || 0,
      status: parseInt(uploadedReceiptData?.status) || 0,
      paymentType: formData.paymentType || "",
      last_4_digit_card: formData.last_4_digit_card || "",
      card_issuer_name: formData.card_issuer_name || "",
      fk_original_receipt_id: uploadedReceiptData?.fk_original_receipt_id || "0",
      fk_forward_from_receipt_id: uploadedReceiptData?.fk_forward_from_receipt_id || "0",
      receipt_category: parseInt(formData.receipt_category) || 0,
      product_date: productDate,
      expense_type: formData.expense_type || "",
      receipt_image: "0", // Match mobile: images live in emailAttachment only
      store_image: getMerchantImage(formData.storeName) || detectedMerchantLogo || uploadedReceiptData?.store_image || "",
      notes: formData.notes || "",
      receipt_forwarded: uploadedReceiptData?.receipt_forwarded || "0",
      receipt_tag: receiptTag,
      create_date: uploadedReceiptData?.create_date || "",
      receipt_tax_values: formData.receipt_tax_values
        .filter(t => !(t.tax_name || "").toLowerCase().includes("tip"))
        .map(t => ({
          id: parseInt(t.id) || 0,
          fk_user_id: parseInt(t.fk_user_id) || fkUserId,
          fk_receipt_id: baseId,
          fk_tax_id: parseInt(t.fk_tax_id) || 0,
          tax_name: t.tax_name || "",
          tax_rate: t.tax_rate || "0",
          tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
          created: parseInt(t.created) || 0,
          updated: parseInt(t.updated) || 0,
        })),
    };
  };

  /** POST a payload to addReceiptv1 and return the response data */
  const postNewReceipt = async (payload) => {
    const token = localStorage.getItem("token");
    console.log("%c[Receipt] POST /api/receipt/addReceiptv1 payload:", "color:#22c55e;font-weight:bold", payload);
    const response = await fetch("/api/receipt/addReceiptv1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accesstoken: token },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to save receipt: ${response.status}`);
    const data = await response.json();
    console.log("%c[Receipt] addReceiptv1 response (full):", "color:#22c55e;font-weight:bold", data);
    return data;
  };

  /** PUT payload to updateReceiptv1 */
  const putUpdateReceipt = async (payload) => {
    const token = localStorage.getItem("token");
    console.log("%c[Receipt] POST /api/receipt/updateReceiptv1 payload:", "color:#f59e0b;font-weight:bold", payload);
    const response = await fetch("/api/receipt/updateReceiptv1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accesstoken: token },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to update receipt: ${response.status}`);
    const data = await response.json();
    console.log("%c[Receipt] updateReceiptv1 response (full):", "color:#f59e0b;font-weight:bold", data);
    return data;
  };

  /** Save original receipt then open a fresh duplicate modal pre-filled with the same data */
  const handleDuplicateConfirm = async () => {
    const validationMsg = getDuplicateReceiptValidationMessage(formData);
    if (validationMsg) {
      setAlertMsg(validationMsg);
      return;
    }
    setIsDuplicateSaving(true);
    setError(null);
    try {
      const payload = buildQuickPayload();
      const isExisting = parseInt(payload.id) > 0;
      if (isExisting) {
        await putUpdateReceipt(payload);
      } else {
        await postNewReceipt(payload);
      }

      // Build the snapshot of all form data to hand to the fresh duplicate modal
      const duplicateSnapshot = {
        formData:             withDuplicateDefaultProductName(formData),
        tags:                 { ...tags },
        uploadedMediaUrls:    [...uploadedMediaUrls],
        uploadedImageUrl:     uploadedImageUrl,
        pdfPreviewUrl:        pdfPreviewUrl,
        uploadedReceiptData:  uploadedReceiptData ? { ...uploadedReceiptData, id: 0 } : null,
      };

      // Close confirmation dialog, notify parent to refresh
      setShowDuplicateConfirm(false);
      if (onReceiptAdded) onReceiptAdded(payload);

      // Hand duplicate data to parent → parent closes this modal and opens a fresh one
      if (onDuplicate) {
        onDuplicate(duplicateSnapshot);
      } else {
        // Fallback (no parent handler): stay in current modal in duplicate mode
        setFormData((prev) => withDuplicateDefaultProductName(prev));
        setIsDuplicateMode(true);
        setIsDuplicated(true);
        setUploadedReceiptData(prev => prev ? { ...prev, id: 0 } : null);
        setToast({
          isVisible: true,
          message: "Your original receipt has been saved successfully. You are now viewing the duplicate receipt.",
          type: "success",
        });
      }
    } catch (err) {
      setShowDuplicateConfirm(false);
      setError("Failed to save original receipt: " + (err.message || "Unknown error"));
    } finally {
      setIsDuplicateSaving(false);
    }
  };

  // ── Split helpers ─────────────────────────────────────────────────────────

  /** Create a blank split seeded with proportional amounts */
  const createSplit = (existingSplits = []) => {
    const mainTotal = parseFloat(formData.purchasePrice) || 0;
    const mainSubtotal = parseFloat(formData.subtotal) || mainTotal;
    const mainTaxes = formData.receipt_tax_values || [];
    const n = existingSplits.length + 1;
    const frac = mainSubtotal > 0 ? (1 / n) : 0;
    const splitSubtotal = parseFloat((mainSubtotal * frac).toFixed(2));
    const splitTotal = parseFloat((mainTotal * frac).toFixed(2));
    return {
      _id: Date.now() + Math.random(),
      receipt_category: formData.receipt_category || 0,
      expense_type: formData.expense_type || "",
      subtotal: splitSubtotal,
      purchasePrice: splitTotal,
      product_name: "",
      receipt_tax_values: mainTaxes.map(t => ({
        ...t,
        tax_amount: parseFloat(((parseFloat(t.tax_rate) / 100) * splitSubtotal).toFixed(2)),
      })),
    };
  };

  /** Open split screen - validates required fields first, starts empty (no auto-splits) */
  const handleOpenSplit = () => {
    const missing = [];
    if (!formData.storeName?.trim()) missing.push("Merchant Name");
    if (!formData.paymentType?.trim() && !formData.card_issuer_name?.trim()) missing.push("Payment Method");
    if (!formData.expense_type?.trim()) missing.push("Expense Category");
    if (!parseFloat(formData.purchasePrice)) missing.push("Total Amount");
    if (missing.length) {
      setError(`Please fill in: ${missing.join(", ")} before splitting.`);
      return;
    }
    setError(null);
    setSplits([]);           // user adds splits manually
    setSplitErrors({});
    setActiveSplitIndex(null);
    setShowSplitScreen(true);
  };

  /** Update a single field on a specific split.
   *
   *  Mirrors the main receipt form's handleFieldChange logic:
   *  - purchasePrice (Total) → back-calculates subtotal via rates, then derives each tax
   *    Formula: subtotal = total / (1 + Σ rate/100)
   *  - subtotal → calculates each tax via rate, then sums to get total
   *  - individual tax_amount edit → just updates in place (user override)
   *  - all other fields → update in place
   *
   *  Amounts are capped at the main receipt's values; an alert fires if exceeded. */
  const updateSplitField = (idx, field, value) => {
    if (field === "subtotal" || field === "purchasePrice") {
      value = sanitizeMoneyInput(value);
    }
    if (field === "product_name") {
      value = (value || "").toString().slice(0, MAX_DESCRIPTION_LENGTH);
    }
    const mainSubtotal = parseFloat(formData.subtotal) || parseFloat(formData.purchasePrice) || 0;
    const mainTotal    = parseFloat(formData.purchasePrice) || 0;

    // ── Max-amount guards ────────────────────────────────────────────────────
    if (field === "subtotal") {
      const sub = parseFloat(value) || 0;
      if (mainSubtotal > 0 && sub > mainSubtotal) {
        setAlertMsg(`Subtotal cannot exceed $${mainSubtotal.toFixed(2)}`);
        return;
      }
    }
    if (field === "purchasePrice") {
      const total = parseFloat(value) || 0;
      if (mainTotal > 0 && total > mainTotal) {
        setAlertMsg(`Total cannot exceed $${mainTotal.toFixed(2)}`);
        return;
      }
    }

    setSplits(prev => {
      const updated = [...prev];
      const split   = updated[idx];

      if (field === "purchasePrice") {
        // ── Same as main form: total → subtotal → taxes ───────────────────
        const totalNum = parseFloat(value) || 0;
        if (totalNum > 0) {
          // subtotal = total / (1 + Σ rate/100)
          const rateSum    = (split.receipt_tax_values || []).reduce(
            (s, t) => s + (parseFloat(t.tax_rate) || 0) / 100, 0
          );
          const sub = parseFloat((totalNum / (1 + rateSum)).toFixed(2));
          const taxes = (split.receipt_tax_values || []).map(t => ({
            ...t,
            tax_amount: sub > 0
              ? parseFloat(((parseFloat(t.tax_rate) / 100) * sub).toFixed(2))
              : "",
          }));
          updated[idx] = { ...split, purchasePrice: value, subtotal: sub > 0 ? sub.toString() : "", receipt_tax_values: taxes };
        } else {
          // total cleared → clear subtotal and taxes too
          updated[idx] = {
            ...split,
            purchasePrice: value,
            subtotal: "",
            receipt_tax_values: (split.receipt_tax_values || []).map(t => ({ ...t, tax_amount: "" })),
          };
        }

      } else if (field === "subtotal") {
        // ── Same as main form: subtotal → taxes → total ───────────────────
        const sub = parseFloat(value) || 0;
        const taxes = (split.receipt_tax_values || []).map(t => ({
          ...t,
          tax_amount: sub > 0
            ? parseFloat(((parseFloat(t.tax_rate) / 100) * sub).toFixed(2))
            : "",
        }));
        const total = sub + taxes.reduce((s, t) => s + (parseFloat(t.tax_amount) || 0), 0);
        updated[idx] = {
          ...split,
          subtotal: value,
          receipt_tax_values: taxes,
          purchasePrice: sub > 0 ? parseFloat(total.toFixed(2)) : "",
        };

      } else {
        // Non-amount field — update in place
        updated[idx] = { ...split, [field]: value };
      }

      return updated;
    });

    // Clear amount error once the user starts filling in a value
    if (field === "subtotal" || field === "purchasePrice") {
      const split = splits[idx];
      if (split && splitErrors[split._id]?.amount) {
        setSplitErrors(prev => {
          const next = { ...prev };
          delete next[split._id];
          return next;
        });
      }
    }
  };

  /** Add a new blank split and immediately open its detail view */
  const addSplit = () => {
    const newSlot = {
      _id: Date.now() + Math.random(),
      receipt_category: formData.receipt_category || 0,
      expense_type:     "",
      product_name:     "",
      subtotal:         "",
      purchasePrice:    "",
      receipt_tax_values: (formData.receipt_tax_values || []).map(t => ({
        ...t,
        id: 0,
        tax_amount: "",
      })),
    };
    const newIdx = splits.length;   // index of the slot we're about to add
    setSplits(prev => [...prev, newSlot]);
    setActiveSplitIndex(newIdx);    // auto-open detail for the new split
  };

  /** Remove a split by index */
  const removeSplit = (idx) => {
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };

  /** Save all splits as separate receipts then close modal */
  const handleSaveSplits = async () => {
    if (splits.length === 0) {
      setError("Please add at least one split before saving.");
      return;
    }

    // ── Validate every split ─────────────────────────────────────────────────
    const newSplitErrors = {};
    splits.forEach((split) => {
      const errs = {};
      if (!parseFloat(split.purchasePrice) && !parseFloat(split.subtotal)) {
        errs.amount = "Please enter an amount for this split.";
      }
      if (Object.keys(errs).length) newSplitErrors[split._id] = errs;
    });

    if (Object.keys(newSplitErrors).length) {
      setSplitErrors(newSplitErrors);
      // Open the first split that has errors so the user sees it
      const firstBadIdx = splits.findIndex(s => newSplitErrors[s._id]);
      if (firstBadIdx !== -1) setActiveSplitIndex(firstBadIdx);
      return;
    }

    setIsSavingSplits(true);
    setError(null);
    try {
      const fkUserId = parseInt(localStorage.getItem("fk_user_id")) || 0;
      let productDate = 0;
      if (formData.product_date) {
        const d = new Date(formData.product_date);
        if (!isNaN(d.getTime())) productDate = Math.floor(d.getTime() / 1000);
      }
      if (!productDate) productDate = Math.floor(Date.now() / 1000);
      const receiptTag = ["0","0","0","0","0","0","0"].join(",");
      const combinedImageUrls = buildCombinedMediaField([
        uploadedMediaUrls,
        uploadedImageUrl,
        uploadedReceiptData?.receipt_image,
        uploadedReceiptData?.emailAttachment,
      ]);

      // Helper: build a receipt payload from a set of amounts + metadata
      const buildSplitPayload = ({ total, subtotalVal, taxVals, category, expenseType, productName }) => ({
        id: 0,
        storeName: formData.storeName || "",
        product_name: productName || "",
        emailAttachment: combinedImageUrls,
        purchasePrice: total.toString(),
        total_amount: total.toString(),
        payment_category_type: parseInt(category) || 0,
        status: 0,
        paymentType: formData.paymentType || "",
        last_4_digit_card: formData.last_4_digit_card || "",
        card_issuer_name: formData.card_issuer_name || "",
        fk_original_receipt_id: "0",
        fk_forward_from_receipt_id: "0",
        receipt_category: parseInt(category) || 0,
        product_date: productDate,
        expense_type: expenseType || formData.expense_type || "",
        receipt_image: "0",
        store_image: getMerchantImage(formData.storeName) || detectedMerchantLogo || "",
        notes: "",
        receipt_forwarded: "0",
        receipt_tag: receiptTag,
        create_date: "",
        receipt_tax_values: taxVals,
      });

      // Save every user-defined split
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

        const payload = buildSplitPayload({
          total: splitTotal,
          subtotalVal: splitSubtotal,
          taxVals: taxValues,
          category: split.receipt_category,
          expenseType: split.expense_type,
          productName: split.product_name,
        });
        await postNewReceipt(payload);
        if (onReceiptAdded) onReceiptAdded(payload);
      }

      // ── Auto-save remainder receipt if splits don't cover the full total ──
      const mainTotal   = parseFloat(formData.purchasePrice) || 0;
      const splitsTotal = parseFloat(
        splits.reduce((s, sp) => s + (parseFloat(sp.purchasePrice) || 0), 0).toFixed(2)
      );
      const remainder   = parseFloat((mainTotal - splitsTotal).toFixed(2));

      if (remainder > 0.009) {   // ignore sub-cent floating-point noise
        // Back-calculate remainder subtotal using the main receipt's tax rates
        const mainTaxRates = formData.receipt_tax_values || [];
        const rateSum      = mainTaxRates.reduce((s, t) => s + (parseFloat(t.tax_rate) || 0) / 100, 0);
        const remSubtotal  = parseFloat((remainder / (1 + rateSum)).toFixed(2));
        const remTaxValues = mainTaxRates.map(t => ({
          id: 0, fk_user_id: fkUserId, fk_receipt_id: 0,
          fk_tax_id: parseInt(t.fk_tax_id) || 0,
          tax_name: t.tax_name || "", tax_rate: t.tax_rate || "0",
          tax_amount: parseFloat(((parseFloat(t.tax_rate) / 100) * remSubtotal).toFixed(2)).toString(),
          created: 0, updated: 0,
        }));

        const remPayload = buildSplitPayload({
          total: remainder,
          subtotalVal: remSubtotal,
          taxVals: remTaxValues,
          category: formData.receipt_category || 0,
          expenseType: formData.expense_type || "",
          productName: "",
        });
        await postNewReceipt(remPayload);
        if (onReceiptAdded) onReceiptAdded(remPayload);
      }

      if (refreshData) refreshData();
      onClose();
    } catch (err) {
      setError("Failed to save splits: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingSplits(false);
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
      setIsFetchingEditLogos(false);
    } catch {
      setIsFetchingEditLogos(false);
    }
  };

  const handleSelectEditLogo = (index) => {
    setEditSelectedLogoIndex(index);
    setEditMerchantLogo(editLogoOptions[index]?.storeUrl || "");
  };

  /** Rename + update logo for ALL receipts using this merchant, then refresh. */
  // Validate only — shows confirmation popup; actual save is in doConfirmMerchantEdit
  const handleSaveEditMerchant = () => {
    if (!editMerchantName.trim()) {
      setEditMerchantError("Please enter Merchant Name");
      return;
    }
    if (merchantExists(editMerchantName, editingMerchant.name)) {
      setEditMerchantError("Merchant already exists");
      return;
    }
    // Validation passed — show styled confirmation popup
    setShowMerchantEditConfirm(true);
  };

  // Called when user taps "Okay" in the merchant edit confirmation popup
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
        await putUpdateReceipt({ ...r, storeName: newName, store_image: newLogo });
      }
      // Update localMerchants so the change is visible immediately before refresh
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
      // If the form currently has this merchant selected, update it too
      if ((formData.storeName || "").toLowerCase() === oldName.toLowerCase()) {
        handleFieldChange("storeName", newName);
        handleFieldChange("store_image", newLogo || "");
        setDetectedMerchantLogo(newLogo || null);
      }
      setShowEditMerchantModal(false);
      setEditingMerchant(null);
      await Promise.all([fetchApiMerchants(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Merchant Updated", type: "success" });
    } catch (err) {
      setEditMerchantError(err.message || "Failed to update merchant.");
    } finally {
      setIsSavingEditMerchant(false);
    }
  };

  /** Show styled confirmation popup before deleting a merchant. */
  const handleDeleteMerchant = (merchant) => {
    if (merchant.name.toLowerCase() === "miscellaneous") return;
    setPendingMerchantDeleteData(merchant);
    setShowMerchantDeleteConfirm(true);
  };

  /** Called when user taps "Delete" in the merchant delete confirmation popup. */
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
        await putUpdateReceipt({ ...r, storeName: "Miscellaneous", store_image: "" });
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
      if ((formData.storeName || "").toLowerCase() === merchant.name.toLowerCase()) {
        handleFieldChange("storeName", "");
        setDetectedMerchantLogo(null);
      }
      hideMerchant(merchant.name);
      await Promise.all([fetchApiMerchants(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Merchant Deleted", type: "success" });
    } catch (err) {
      setToast({ isVisible: true, message: err.message || "Failed to delete merchant.", type: "error" });
    } finally {
      setIsSavingEditMerchant(false);
    }
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.3, ease: "easeOut" },
    },
  };

  const inputClass =
    "w-full border border-blue-400 text-sm px-2 py-1 rounded-md bg-white text-gray-800 mt-2.5 mb-0";

  // Fetch merchant logos using imagesearch API - returns array of logo URLs
  const fetchMerchantLogos = useCallback(async (merchantName) => {
    if (!merchantName || merchantName.trim().length === 0) {
      return [];
    }

    setIsFetchingLogos(true);
    try {
      const query = `${merchantName} logo`;
      const encodedQuery = encodeURIComponent(query);

      const resp = await fetch(`/imagesearch?searchkeyword=${encodedQuery}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        throw new Error(`API returned ${resp.status}`);
      }

      let data;
      const contentType = resp.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        try {
          data = JSON.parse(text);
        } catch {
          const urlMatch = text.match(
            /(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i,
          );
          if (urlMatch) {
            return [urlMatch[1]];
          } else {
            throw new Error("No valid image URL found");
          }
        }
      }

      // Each entry: { displayUrl (thumb – direct load), storeUrl (full – stored in DB) }
      const logoEntries = [];
      const isValidHttpUrl = (u) => u && /^https?:\/\//i.test(u);

      // Primary format: array of {fullurl, thumburl, ...}
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          if (item && typeof item === "object") {
            const fullUrl = item.fullurl || item.url || item.image || item.src || item.link;
            const thumbUrl = item.thumburl || fullUrl;
            const storeUrl = fullUrl || thumbUrl;
            if (isValidHttpUrl(storeUrl)) {
              logoEntries.push({
                displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : storeUrl,
                storeUrl,
              });
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
              const fullUrl = item.fullurl || item.url || item.image || item.src || item.link;
              const thumbUrl = item.thumburl || fullUrl;
              if (isValidHttpUrl(fullUrl)) {
                logoEntries.push({
                  displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : fullUrl,
                  storeUrl: fullUrl,
                });
              }
            }
          }
        }
        const directUrl = data.url || data.image || data.src || data.link || data.fullurl;
        if (isValidHttpUrl(directUrl)) {
          logoEntries.push({ displayUrl: directUrl, storeUrl: directUrl });
        }
      }

      return logoEntries;
    } catch (error) {
      console.error(
        `Error fetching merchant logos for ${merchantName}:`,
        error,
      );
      return [];
    } finally {
      setIsFetchingLogos(false);
    }
  }, []);

  // Auto-fetch logos when merchant name is entered in Add Merchant modal
  useEffect(() => {
    if (
      showAddMerchantModal &&
      newMerchantName &&
      newMerchantName.trim().length > 0
    ) {
      // Debounce: wait 800ms after user stops typing
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
  }, [newMerchantName, showAddMerchantModal, fetchMerchantLogos]);
  
  // Refresh taxes when Manage Tax Types modal closes
  useEffect(() => {
    if (!showManageTaxModal) {
      const refreshTaxes = async () => { await fetchTaxes(); };
      refreshTaxes();
    }
  }, [showManageTaxModal, fetchTaxes]);

  useEffect(() => {
    if ((editingTaxId || showAddTaxForm) && manageTaxModalBodyRef.current) {
      manageTaxModalBodyRef.current.scrollTop = 0;
    }
  }, [editingTaxId, showAddTaxForm]);

  // Auto-apply default tax types when entering the form step (if no taxes already set)
  useEffect(() => {
    if (step !== "form") return;
    if (formData.receipt_tax_values.length > 0) return; // OCR already set taxes — don't override
    if (!taxData?.length) return;
    
    const defaultTaxes = taxData.filter(t => parseInt(t.is_default_tax) === 1);
    if (defaultTaxes.length === 0) return;
    
    const toApply = defaultTaxes.map(t => ({
      id: t.id || 0,
      fk_user_id: t.fk_user_id || 0,
      fk_receipt_id: 0,
      fk_tax_id: t.id || 0,
      tax_name: t.tax_name || "",
      tax_rate: t.tax_rate || "0",
      tax_amount: "",
      tax_number: t.tax_number || "",
      created: 0,
      updated: 0,
    }));
    if (toApply.length > 0) {
      setFormData(prev => ({ ...prev, receipt_tax_values: toApply }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, taxData]);
  // Cleanup PDF preview URL on unmount
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

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
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(e.target)
      ) {
        setShowOptionsMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

const handleOpenAddMerchantModal = () => {
  setNewMerchantName("");
  setNewMerchantLogo("");
  setLogoOptions([]);
  setSelectedLogoIndex(null);
  setShowAddMerchantModal(true);
  setShowMerchantDropdown(false);
};

const handleCloseAddMerchantModal = () => {
  setNewMerchantName("");
  setNewMerchantLogo("");
  setLogoOptions([]);
  setSelectedLogoIndex(null);
  setShowAddMerchantModal(false);
  setError(null);
};

const handleSelectLogo = (index) => {
  setSelectedLogoIndex(index);
  setNewMerchantLogo(logoOptions[index]?.storeUrl || "");
};

  // Handle fetching logos manually
  const handleFetchLogos = async () => {
    if (!newMerchantName || newMerchantName.trim().length === 0) {
      setError("Please enter merchant name first");
      return;
    }

    const logos = await fetchMerchantLogos(newMerchantName);
    setLogoOptions(logos);
    if (logos.length > 0) {
      setSelectedLogoIndex(0);
      setNewMerchantLogo(logos[0].storeUrl);
      setError(null);
    } else {
      setError(
        "Could not find logos for this merchant. Please try a different name.",
      );
      setSelectedLogoIndex(null);
      setNewMerchantLogo("");
    }
  };

  // Handle adding new merchant
  const handleAddMerchant = async () => {
    const name = (newMerchantName || "").trim();
    const normalizedName = name.toLowerCase();

    // 1. Empty name check
    if (!name) {
      setError("Please enter Merchant Name");
      return;
    }

    // 1b. Emoji check
    if (containsEmoji(name)) {
      setAlertMsg("Emojis are not allowed in merchant names. Please use plain text.");
      return;
    }

    // 2. Duplicate check (case-insensitive, against global list)
    if (merchantExists(name)) {
      setError("Merchant already exists");
      return;
    }

    // 3. Get selected logo (optional)
    const selectedLogoUrl =
      selectedLogoIndex !== null
        ? logoOptions[selectedLogoIndex]?.storeUrl || ""
        : newMerchantLogo || "";

    // 4. Persist to API (re-fetches list with server-assigned id)
    const addResult = await addApiMerchant(name, selectedLogoUrl);
    if (!addResult?.ok) {
      setError(addResult?.error || "Failed to add merchant");
      return;
    }

    // 5. Update local logo cache
    if (selectedLogoUrl) saveMerchLogo(name, selectedLogoUrl);
    setLocalMerchants((prev) => {
      const existingIndex = prev.findIndex(
        (m) => (m.name || "").toString().trim().toLowerCase() === normalizedName,
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

    // 6. Select the new merchant in the form
    handleFieldChange("storeName", name);
    setDetectedMerchantLogo(selectedLogoUrl || null);

    // 7. Reset and close
    setNewMerchantName("");
    setNewMerchantLogo("");
    setLogoOptions([]);
    setSelectedLogoIndex(null);
    setShowAddMerchantModal(false);
    setShowMerchantDropdown(false);
    setError(null);

    // 8. Show success
    setToast?.({
      isVisible: true,
      message: "Merchant Added",
      type: "success",
    });
  };

  // Handle opening Add Payment Method modal
  const handleOpenAddPaymentModal = () => {
    setPayModalEditMode(null);
    setNewPaymentCardType(
      formData.paymentType ? formData.paymentType.split(" *")[0] : "",
    );
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType(
      formData.receipt_category === "1" ? "Business" : "Personal",
    );
    setShowAddPaymentModal(true);
    setShowPaymentDropdown(false);
  };

  // Handle closing Add Payment Method modal
  const handleCloseAddPaymentModal = () => {
    if (isPayMethodSaving) return;
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setPayModalEditMode(null);
    setShowAddPaymentModal(false);
    setError(null);
  };

  // ── Payment method helpers (same logic as ReceiptDetail) ──────────────────
  const isCashPaymentMethod = (name) =>
    (name || "").toString().replace(/\s*\*\s*\d{3,4}\s*$/, "").trim().toLowerCase() === "cash";

  const handleEditPaymentInDropdown = (method) => {
    if (isCashPaymentMethod(method)) return;
    const { issuer, last4 } = parsePaymentDisplay(method);
    const _pct = readPayCardTypeMap();
    const apiMatch = (apiPaymentMethods || []).find((p) =>
      apiPaymentMethodMatchesLabel(p, method)
    );
    const apiId = apiMatch ? (apiMatch.id ?? apiMatch.payment_method_id ?? null) : null;
    // Use card_type from the API record (authoritative integer enum) so entries like
    // "Bank of America" (card_type=1) correctly highlight MasterCard, not "Other".
    const brandFromApiType = apiMatch ? cardTypeIntToBrand(apiMatch.card_type) : "";
    const cardType = brandFromApiType || _pct[method] || inferCardTypeFromPayment(method);
    setNewPaymentCardType(cardType);
    // Leave Card Issuer empty when the name is only brand + last4 (same as Settings).
    setNewCardIssuerName(isCustomCardIssuer(issuer, cardType) ? issuer : "");
    setNewLast4Digits(last4 || "");
    const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
    setNewPaymentCategoryType(_pet[method] || "");
    setPayModalEditMode({ name: method, apiId });
    setShowAddPaymentModal(true);
    setShowPaymentDropdown(false);
  };

  const handleDeletePaymentInDropdown = (method) => {
    if (isCashPaymentMethod(method)) return;
    setPendingPayDeleteMethod(method);
    setShowPayDeleteConfirm(true);
  };

  const doConfirmPayDeleteInDropdown = async () => {
    setShowPayDeleteConfirm(false);
    const method = pendingPayDeleteMethod;
    setPendingPayDeleteMethod(null);
    if (!method) return;
    // Set payment method to Cash on all matching receipts
    const matching = (receipts || []).filter(
      (r) => getPaymentDisplayFromReceipt(r).toLowerCase() === (method || "").toLowerCase()
    );
    if (matching.length > 0) {
      await Promise.all(matching.map(r =>
        updateReceipt(r.id, { paymentType: "Cash", card_issuer_name: "", last_4_digit_card: "" })
      ));
    }
    const apiMatch = (apiPaymentMethods || []).find((p) =>
      apiPaymentMethodMatchesLabel(p, method)
    );
    const targetApiId = apiMatch ? (apiMatch.id ?? apiMatch.payment_method_id ?? null) : null;
    await deleteApiPaymentMethod(targetApiId, method);
    hidePaymentMethod(method);
    deleteCustomPaymentMethod(method);
    await fetchApiPaymentMethods();
    setToast({ isVisible: true, message: "Payment Method Deleted", type: "success" });
  };

  // Handle adding new payment method
  const handleAddPaymentMethod = async () => {
    if (!newPaymentCardType || newPaymentCardType.trim().length === 0) {
      setError("Select Card Type");
      return;
    }
    if (!newLast4Digits || newLast4Digits.trim().replace(/\D/g, "").length < 4) {
      setError("Please enter last 4 digits of card number");
      return;
    }
    if (paymentDuplicateError) {
      setError("Payment Method already exists");
      return;
    }

    const customIssuer = newCardIssuerName.trim();
    const cardTypeLower = newPaymentCardType.trim().toLowerCase();

    let selectedCardTypeForLogo = null;
    if (cardTypeLower.includes("visa")) {
      selectedCardTypeForLogo = "Visa";
    } else if (cardTypeLower.includes("master")) {
      selectedCardTypeForLogo = "MasterCard";
    } else if (
      cardTypeLower.includes("american express") ||
      cardTypeLower.includes("amex")
    ) {
      selectedCardTypeForLogo = "American Express";
    } else if (cardTypeLower.includes("discover")) {
      selectedCardTypeForLogo = "Discover";
    } else if (cardTypeLower.includes("diners")) {
      selectedCardTypeForLogo = "Diners Club";
    } else if (cardTypeLower.includes("paypal")) {
      selectedCardTypeForLogo = "PayPal";
    } else if (cardTypeLower.includes("debit")) {
      selectedCardTypeForLogo = "Debit Card";
    } else if (cardTypeLower === "other") {
      selectedCardTypeForLogo = "Other";
    } else {
      selectedCardTypeForLogo = newPaymentCardType.trim();
    }

    const last4Final = newLast4Digits.trim().replace(/\D/g, "").slice(0, 4);
    // Skip receipt-based duplicate check in edit mode — the receipts that use this card
    // ARE the card being edited; finding them is expected, not a duplicate.
    if (!payModalEditMode && paymentMethodDuplicateExists(selectedCardTypeForLogo, last4Final)) {
      setError("Payment Method already exists");
      return;
    }

    const storedIssuer = storedCardIssuerName(customIssuer, selectedCardTypeForLogo);
    const paymentMethodString = buildPaymentMethodStorageString(
      customIssuer,
      selectedCardTypeForLogo,
      last4Final
    );

    const PAYMENT_LOGOS = { Visa: Visa, MasterCard: MasterCard, "American Express": AmericanExpress, Discover: Discover, "Diners Club": DinersClub, PayPal: PayPal, "Debit Card": DebitCard, Cash: Cash, Other: Creditdebitcardicon };
    const logoUrl = PAYMENT_LOGOS[selectedCardTypeForLogo] || "";

    // ── EDIT MODE ────────────────────────────────────────────────────────────
    if (payModalEditMode) {
      const { name: oldName, apiId } = payModalEditMode;

      // ── Confirmation before updating any API or receipts ──────────────────
      setPayConfirmMessage(
        "When editing a payment method, all receipts associated with that payment method will also be updated."
      );
      setPendingPayEditFn(() => async () => {
        if (apiId != null) {
          await updateApiPaymentMethod(
            apiId,
            {
              cardIssuerName: storedIssuer,
              cardTypeBrand: selectedCardTypeForLogo,
              last4: last4Final,
            },
            logoUrl,
            newPaymentCategoryType || ""
          );
        }
        // Update receipts that used the old payment method name.
        // Use a broad match: exact display string OR same last4+issuer fields,
        // so receipts stored via different code paths are all caught.
        const { issuer: oldIssuer, last4: oldLast4 } = parsePaymentDisplay(oldName || "");
        const exactByDisplay = (receipts || []).filter(
          (r) => getPaymentDisplayFromReceipt(r).toLowerCase() === (oldName || "").toLowerCase()
        );
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
          await Promise.all(matchingReceipts.map(r => updateReceipt(r.id, {
            paymentType: selectedCardTypeForLogo,
            card_issuer_name: storedIssuer,
            last_4_digit_card: last4Final || r.last_4_digit_card || "",
            payment_logo_url: "",
            paymentLogoUrl: "",
          })));
        }
        const _pct = readPayCardTypeMap();
        _pct[paymentMethodString] = selectedCardTypeForLogo;
        localStorage.setItem("cat_pay_card_types", JSON.stringify(_pct));
        if (newPaymentCategoryType) {
          const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
          _pet[paymentMethodString] = newPaymentCategoryType;
          localStorage.setItem("cat_pay_expense_type", JSON.stringify(_pet));
        }
        editCustomPaymentMethod(oldName, paymentMethodString);
        await fetchApiPaymentMethods();
        handleFieldChange("paymentType", selectedCardTypeForLogo || paymentMethodString);
        handleFieldChange("card_issuer_name", storedIssuer);
        if (last4Final) handleFieldChange("last_4_digit_card", last4Final);
        handleFieldChange("payment_logo_url", "");
        handleFieldChange("paymentLogoUrl", "");
        handleCloseAddPaymentModal();
        setShowPaymentDropdown(false);
        setToast({ isVisible: true, message: "Payment Method Updated", type: "success" });
      });
      setShowPayEditConfirm(true);
      return;
    }

    // ── ADD MODE ─────────────────────────────────────────────────────────────
    // No confirmation needed for add — save directly
    setIsPayMethodSaving(true);
    try {
      const newPaymentMethod = {
        paymentType: paymentMethodString,
        cardIssuerName: storedIssuer,
        selectedCardType: selectedCardTypeForLogo,
        last4DigitCard: last4Final || "",
        paymentCategoryType: newPaymentCategoryType || "Personal",
      };
      setLocalPaymentMethods((prev) => [...prev, newPaymentMethod]);

      // Pass logoUrl and expenseType so card_type, icon_image, default_payment_category are all sent correctly
      await addApiPaymentMethod(
        {
          cardIssuerName: storedIssuer,
          cardTypeBrand: selectedCardTypeForLogo,
          last4: last4Final,
        },
        logoUrl,
        newPaymentCategoryType || "Personal"
      );
      const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
      _pct[paymentMethodString] = selectedCardTypeForLogo;
      localStorage.setItem("cat_pay_card_types", JSON.stringify(_pct));
      if (newPaymentCategoryType) {
        const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
        _pet[paymentMethodString] = newPaymentCategoryType;
        localStorage.setItem("cat_pay_expense_type", JSON.stringify(_pet));
      }
      // Do NOT call fetchApiPaymentMethods() here — addApiPaymentMethod already does an optimistic
      // update to apiPaymentMethods. Fetching immediately can race with the server and overwrite
      // the new entry with a stale list, making the method invisible until next page load.

      // For "Other" card type, store the full "Other *XXXX" string as paymentType so the dropdown
      // can match it; for all other known brands, store just the brand name (standard data model).
      const paymentTypeForForm = selectedCardTypeForLogo === "Other"
        ? paymentMethodString
        : (selectedCardTypeForLogo || paymentMethodString);
      handleFieldChange("paymentType", paymentTypeForForm);
      handleFieldChange("card_issuer_name", storedIssuer);
      if (last4Final) handleFieldChange("last_4_digit_card", last4Final);
      if (newPaymentCategoryType === "Business") {
        handleFieldChange("receipt_category", "1");
      } else if (newPaymentCategoryType === "Personal") {
        handleFieldChange("receipt_category", "0");
      }

      handleCloseAddPaymentModal();
      setShowPaymentDropdown(false);
      setToast({ isVisible: true, message: "Payment Method Added", type: "success" });
    } catch (e) {
      setToast({ isVisible: true, message: e?.message || "Save failed", type: "error" });
    } finally {
      setIsPayMethodSaving(false);
    }
  };

  // Filter functions for dropdowns - use merchantsWithImages
  // Show all merchants when dropdown opens, only filter when user is actively typing
  const sortMerchantsAlpha = (list) => {
    return [...list].sort((a, b) =>
      (a?.name || "").toString().toLowerCase().localeCompare((b?.name || "").toString().toLowerCase())
    );
  };

  const filteredMerchants = (() => {
    if (!isMerchantTyping && !formData.storeName) {
      // Show all when dropdown opens and no value
      return sortMerchantsAlpha(allMerchantsWithImages);
    }
    if (!isMerchantTyping) {
      // Show all when dropdown opens even if there's a value (from auto-detection)
      return sortMerchantsAlpha(allMerchantsWithImages);
    }
    // Filter only when user is actively typing
    const searchTerm = (formData.storeName || "").toLowerCase();
    if (!searchTerm) {
      return sortMerchantsAlpha(allMerchantsWithImages);
    }
    return sortMerchantsAlpha(allMerchantsWithImages.filter((m) =>
      m.name?.toLowerCase().includes(searchTerm)
    ));
  })();

  // Show all categories when not typing; filter only while user is actively typing
  const filteredCategories = isCategoryTyping
    ? allExpenseCategories.filter((c) =>
        c.toLowerCase().includes((formData.expense_type || "").toLowerCase())
      )
    : allExpenseCategories;

  // Payment card types are now defined in EditPaymentMethodModal (PAYMENT_CARD_TYPES)

  // Filter payment methods - show all options when dropdown opens, filter when typing
  // Convert localPaymentMethods objects to display format: cardIssuerName *last4 (not paymentType)
  const localPaymentMethodStrings = localPaymentMethods.map((pm) => {
    const issuerName = pm.cardIssuerName || "";
    const last4 = pm.last4DigitCard || "";
    const brand = pm.selectedCardType || inferCardTypeFromPayment(pm.paymentType || "");
    if (issuerName && last4) {
      return isCustomCardIssuer(issuerName, brand)
        ? `${issuerName} *${last4}`
        : getPaymentMethodListLabel(`${brand} *${last4}`, brand);
    }
    if (issuerName) return issuerName;
    if (brand && last4) return `${brand} *${last4}`;
    return pm.paymentType || "";
  });

  // Deduplicate payment methods by last4 — when two entries share the same
  // last4 the winner is chosen by this priority:
  //   1. Entry whose base name matches a known API card_type brand (most reliable)
  //   2. Entry whose base name matches the current API payment method display name
  //   3. Longer base name (old heuristic, last resort)
  const deduplicatePaymentMethods = (methods) => {
    const methodMap = new Map();
    const last4ToMethods = new Map();

    methods.forEach((method) => {
      const methodStr =
        typeof method === "string"
          ? method
          : method?.paymentType || String(method);
      const last4Match = methodStr.match(/\*(\d{3,4})$/);
      const last4 = last4Match ? last4Match[1] : null;
      const baseName = last4Match
        ? methodStr.replace(/\s*\*\d{3,4}$/, "").trim()
        : methodStr;

      if (last4) {
        if (!last4ToMethods.has(last4)) last4ToMethods.set(last4, []);
        last4ToMethods.get(last4).push({ methodStr, baseName });
      } else {
        methodMap.set(methodStr.toLowerCase(), methodStr);
      }
    });

    last4ToMethods.forEach((methodsWithSameLast4, last4) => {
      if (methodsWithSameLast4.length === 1) {
        methodMap.set(methodsWithSameLast4[0].methodStr.toLowerCase(), methodsWithSameLast4[0].methodStr);
        return;
      }

      // Priority 1: whose base name matches the API record for this last4
      const apiRec = (apiPaymentMethods || []).find(
        p => getLast4FromPaymentApiRecord(p) === last4
      );
      const apiDisplayName = apiRec ? getApiPaymentMethodDisplayName(apiRec) : null;
      const apiBrand = apiRec ? cardTypeIntToBrand(apiRec.card_type) : null;

      let winner = methodsWithSameLast4.find(m =>
        apiDisplayName && m.methodStr.toLowerCase() === apiDisplayName.toLowerCase()
      );

      // Priority 2: whose base name IS the known brand for this last4's card_type
      if (!winner && apiBrand && apiBrand !== "Other") {
        winner = methodsWithSameLast4.find(m =>
          m.baseName.toLowerCase() === apiBrand.toLowerCase()
        );
      }

      // Priority 3: fall back to longest base name (old heuristic)
      if (!winner) {
        methodsWithSameLast4.sort((a, b) => b.baseName.length - a.baseName.length);
        winner = methodsWithSameLast4[0];
      }

      methodMap.set(winner.methodStr.toLowerCase(), winner.methodStr);
    });

    return Array.from(methodMap.values());
  };

  const merchantExists = (name, excludeName = "") => {
    const normalized = (name || "").trim().toLowerCase();
    const excluded = (excludeName || "").trim().toLowerCase();
    if (!normalized) return false;
    return allMerchantsWithImages.some((m) => {
      const mn = (m.name || "").trim().toLowerCase();
      return mn === normalized && mn !== excluded;
    });
  };

  const expenseCategoryExists = (name, excludeName = "") => {
    const normalized = (name || "").trim().toLowerCase();
    const excluded = (excludeName || "").trim().toLowerCase();
    if (!normalized) return false;
    return allExpenseCategories.some((c) => {
      const cn = (c || "").trim().toLowerCase();
      return cn === normalized && cn !== excluded;
    });
  };

  const paymentMethodDuplicateExists = (cardType, last4) => {
    const normalizedCardType = (cardType || "").trim().toLowerCase();
    const normalizedLast4 = (last4 || "").replace(/\D/g, "").slice(0, 4);
    if (!normalizedCardType || normalizedLast4.length !== 4) return false;

    // Strip trailing " *XXXX" from paymentType before comparing brand names.
    // Old receipts store "Diners Club" (brand only); new receipts store "Diners Club *3334".
    // Without stripping, old-format receipts would falsely match the brand even for
    // different cards if they happen to share the same brand name.
    const extractBrand = (str) =>
      (str || "").toString().trim().toLowerCase().replace(/\s*\*\d{3,4}\s*$/, "").trim();

    const inReceipts = (receipts || []).some((r) => {
      const existingBrand = extractBrand(r.paymentType || r.payment_type || "");
      const existingLast4 = (r.last_4_digit_card || r.last4DigitCard || "").toString().replace(/\D/g, "").slice(-4);
      return existingBrand === normalizedCardType && existingLast4 === normalizedLast4;
    });
    if (inReceipts) return true;

    return (localPaymentMethods || []).some((pm) => {
      const existingCardType = (pm.selectedCardType || pm.paymentType || "").toString().trim().toLowerCase();
      const existingLast4 = (pm.last4DigitCard || "").toString().replace(/\D/g, "").slice(-4);
      return existingCardType === normalizedCardType && existingLast4 === normalizedLast4;
    });
  };

  const normalizePaymentMethodKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*\*\s*/, " *")
      .toLowerCase();

  const paymentMethodNameExists = (name, excludeName = "") => {
    const target = normalizePaymentMethodKey(name);
    const excluded = normalizePaymentMethodKey(excludeName);
    if (!target) return false;
    // Only check explicitly registered methods (API records + methods added locally in
    // this session). Do NOT include allPaymentMethods / paymentMethods here — that list
    // blends in receipt-derived names (enriched paymentType strings from past receipts)
    // which should never prevent a user from explicitly registering a payment method.
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

  const editMerchantDuplicateError =
    editMerchantName.trim() && merchantExists(editMerchantName, editingMerchant?.name || "")
      ? "Merchant already exists"
      : "";

  const filteredPaymentMethods = (() => {
    const allMethodsCombined = [
      ...allPaymentMethods,
      ...localPaymentMethodStrings,
    ];
    const deduplicated = deduplicatePaymentMethods(allMethodsCombined);

    if (!isPaymentTyping && !formData.paymentType) {
      // Show all when dropdown opens and no value
      return deduplicated;
    }
    if (!isPaymentTyping) {
      // Show all when dropdown opens even if there's a value (from auto-detection)
      return deduplicated;
    }
    // Filter only when user is actively typing
    const searchTerm = (formData.paymentType || "").toLowerCase().trim();
    if (!searchTerm) {
      return deduplicated;
    }
    const matches = deduplicated.filter((p) => {
      const pLower =
        typeof p === "string" ? p.toLowerCase() : String(p).toLowerCase();
      return pLower.includes(searchTerm) || searchTerm.includes(pLower);
    });
    return matches.length > 0 ? matches : deduplicated;
  })();

  // Get image preview URL
  const getImagePreviewUrl = () => {
    // If PDF preview exists, use it
    if (pdfPreviewUrl) {
      return pdfPreviewUrl;
    }

    // For image files, use local file or uploaded URL
    if (localImageFile) {
      // Check if it's a PDF - if so, use PDF preview
      if (
        localImageFile.type === "application/pdf" ||
        localImageFile.name.toLowerCase().endsWith(".pdf")
      ) {
        return pdfPreviewUrl || null;
      }
      return URL.createObjectURL(localImageFile);
    }
    if (uploadedImageUrl) {
      return uploadedImageUrl;
    }
    return null;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={backdropVariants}
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 backdrop-blur-sm"
        onClick={(e) => {
          // Only close if clicking directly on backdrop, not on modal content
          if (e.target === e.currentTarget && !isUploading && !isSaving) {
            onClose();
          }
        }}
      >
        <div
          className="relative w-full h-full overflow-auto p-2 sm:p-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            variants={modalVariants}
            className="relative inline-block w-full max-w-4xl"
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-gray-200 relative flex flex-col">
              {/* Loading Overlay for Tax Type Saving */}
              {isSavingTax && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[100] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-gray-700 font-medium">
                      Saving tax type...
                    </p>
                  </div>
                </div>
              )}
              {/* Modal Header */}
              <div className="receipt-modal-header flex items-center border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-2.5 bg-white sticky top-0 z-20">
                {/* Left side – Close / Back */}
                <div className="w-[90px] sm:w-[130px] flex justify-start gap-1">
                  {showSplitScreen && activeSplitIndex !== null ? (
                    // Back from split detail → split overview
                    <button
                      type="button"
                      onClick={() => setActiveSplitIndex(null)}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ChevronLeft size={18} className="text-gray-700" />
                    </button>
                  ) : showSplitScreen ? (
                    // Back from split overview → form
                    <button
                      type="button"
                      onClick={() => { setShowSplitScreen(false); setActiveSplitIndex(null); }}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ChevronLeft size={18} className="text-gray-700" />
                    </button>
                  ) : (
                    // Normal close button
                    <button
                      onClick={onClose}
                      disabled={isUploading || isSaving}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-colors"
                      style={{ backgroundColor: "#000000" }}
                      aria-label="Close"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Title – dynamic */}
                <h2 className="flex-1 text-center text-sm sm:text-base md:text-lg font-bold text-gray-900">
                  {showSplitScreen && activeSplitIndex !== null
                    ? "Add Receipt Split"
                    : showSplitScreen
                    ? "Split Expense"
                    : isDuplicateMode
                    ? "Add Duplicate"
                    : "Add Receipt"}
                </h2>

                {/* Right side */}
                <div className="w-[90px] sm:w-[130px] flex items-center justify-end gap-1 sm:gap-2">
                  {/* Split screen: SAVE button */}
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
                  {/* Split detail: SAVE button — validates before going back */}
                  {showSplitScreen && activeSplitIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        const split = splits[activeSplitIndex];
                        if (!parseFloat(split?.purchasePrice) && !parseFloat(split?.subtotal)) {
                          setSplitErrors(prev => ({
                            ...prev,
                            [split._id]: { amount: "Please enter an amount for this split." },
                          }));
                          return;
                        }
                        setSplitErrors(prev => {
                          const next = { ...prev };
                          if (split) delete next[split._id];
                          return next;
                        });
                        setActiveSplitIndex(null);
                      }}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
                    >
                      SAVE
                    </button>
                  )}
                  {/* Normal form: Delete icon + "..." options menu */}
                  {step === "form" && !showSplitScreen && (
                    <>
                      {/* Lock / Unlock toggle */}
                      <button
                        type="button"
                        onClick={() => setTags(prev => ({ ...prev, locked: !prev.locked }))}
                        className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-colors ${
                          tags.locked
                            ? "bg-red-100 hover:bg-red-200"
                            : "bg-gray-100 hover:bg-gray-200"
                        }`}
                        title={tags.locked ? "Unlock receipt" : "Lock receipt"}
                      >
                        <img
                          src={tags.locked ? lockedImg : unlockedImg}
                          alt={tags.locked ? "Locked" : "Unlocked"}
                          className="w-4 h-4 object-contain"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStep("upload");
                          resetReceiptMediaState();
                        }}
                        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-red-50 rounded-full transition-colors group"
                        title="Remove and start over"
                      >
                        <Trash2 size={16} className="text-red-500 group-hover:text-red-600" />
                      </button>

                      {/* "..." options menu */}
                      <div className="relative" ref={optionsMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowOptionsMenu(prev => !prev)}
                          className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                          title="More options"
                        >
                          <MoreHorizontal size={16} className="text-white" />
                        </button>
                        {showOptionsMenu && (
                          <div className="absolute top-full right-0 mt-2 bg-white shadow-xl border border-gray-200 rounded-xl z-[100] min-w-[160px] overflow-hidden">
                            <button
                              type="button"
                              className={`w-full text-left px-4 py-3 text-sm font-medium border-b border-gray-100 transition-colors ${isDuplicated ? "text-gray-400 cursor-not-allowed" : "hover:bg-gray-50 text-gray-800"}`}
                              onClick={() => {
                                if (isDuplicated) return;
                                setShowOptionsMenu(false);
                                const validationMsg = getDuplicateReceiptValidationMessage(formData);
                                if (validationMsg) {
                                  setAlertMsg(validationMsg);
                                  return;
                                }
                                setShowDuplicateConfirm(true);
                              }}
                              disabled={isDuplicated}
                            >
                              {isDuplicated ? "Duplicate (done)" : "Duplicate"}
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                              onClick={() => { setShowOptionsMenu(false); handleOpenSplit(); }}
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

              {/* Top Error Banner */}
              {error && (
                <div className="flex items-center gap-2 bg-yellow-50 border-b border-yellow-200 px-4 py-0.5">
                  <span className="text-black flex-shrink-0">⚠️ Please Select Merchant </span>
                  <span
                    className="text-yellow-800 text-md flex-1 min-w-0 truncate"
                    title={error}
                  >
                    {error}
                  </span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-yellow-500 hover:text-yellow-700 text-lg leading-none flex-shrink-0 ml-1"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 min-h-0 relative">
                {/* ── Locked overlay — blocks all form interactions when receipt is locked ── */}
                {tags.locked && step === "form" && !showSplitScreen && (
                  <div
                    className="absolute inset-0 z-30 cursor-not-allowed flex flex-col items-center justify-start pt-10 gap-3"
                    style={{ backgroundColor: "rgba(0,0,0,0.18)" }}
                    onClick={() =>
                      setToast({
                        isVisible: true,
                        message: "🔒 Receipt is locked. Press the lock button to unlock before editing.",
                        type: "error",
                      })
                    }
                  >
                    <div className="bg-white/95 rounded-xl px-6 py-4 shadow-lg border border-red-200 flex items-center gap-3 max-w-xs mx-4">
                      <img src={lockedImg} alt="Locked" className="w-6 h-6 object-contain flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-800">
                        Receipt is locked.<br />
                        <span className="text-red-600 font-bold">Tap 🔒 in the header to unlock.</span>
                      </p>
                    </div>
                  </div>
                )}
                {showSplitScreen ? (
                  /* ── Split Screen ──────────────────────────────────── */
                  <div className="p-4 sm:p-6">
                    {activeSplitIndex !== null && splits[activeSplitIndex] ? (
                      /* ── Split Detail View ── */
                      (() => {
                        const split = splits[activeSplitIndex];
                        const mainSubtotal = parseFloat(formData.subtotal) || parseFloat(formData.purchasePrice) || 0;
                        const mainTotal    = parseFloat(formData.purchasePrice) || 0;
                        const fieldErr     = splitErrors[split._id] || {};
                        const hasAmountErr = !!fieldErr.amount;
                        return (
                          <div className="space-y-4">
                            {/* Personal / Business toggle */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Expense Type</label>
                              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                                <button
                                  type="button"
                                  className={`flex-1 py-2 text-sm font-medium transition-colors ${parseInt(split.receipt_category) !== 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => updateSplitField(activeSplitIndex, "receipt_category", 0)}
                                >Personal</button>
                                <button
                                  type="button"
                                  className={`flex-1 py-2 text-sm font-medium transition-colors ${parseInt(split.receipt_category) === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => updateSplitField(activeSplitIndex, "receipt_category", 1)}
                                >Business</button>
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
                                <label className={`text-xs font-bold uppercase tracking-wide ${hasAmountErr ? "text-red-500" : "text-gray-500"}`}>
                                  Subtotal *
                                </label>
                                <span className="text-xs text-gray-400">Max: ${mainSubtotal.toFixed(2)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                                <input
                                  type="number"
                                  className={`w-full text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800 border ${hasAmountErr ? "border-red-400 ring-1 ring-red-300" : "border-blue-400"}`}
                                  value={split.subtotal ?? ""}
                                  onChange={(e) => updateSplitField(activeSplitIndex, "subtotal", e.target.value)}
                                  placeholder="0.00"
                                  min="0"
                                  max={mainSubtotal}
                                  step="0.01"
                                />
                              </div>
                              {hasAmountErr && (
                                <p className="mt-1 text-xs text-red-500">{fieldErr.amount}</p>
                              )}
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
                                    <input
                                      type="number"
                                      className="w-full border border-blue-400 text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800"
                                      value={t.tax_amount ?? ""}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        if (maxTax > 0 && v > maxTax) {
                                          setAlertMsg(`${t.tax_name} cannot exceed $${maxTax.toFixed(2)}`);
                                          return;
                                        }
                                        const updatedTaxes = split.receipt_tax_values.map((tv, tvi) =>
                                          tvi === ti ? { ...tv, tax_amount: e.target.value } : tv
                                        );
                                        updateSplitField(activeSplitIndex, "receipt_tax_values", updatedTaxes);
                                      }}
                                      placeholder="0.00"
                                      min="0"
                                      step="0.01"
                                    />
                                  </div>
                                </div>
                              );
                            })}

                            {/* Total */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className={`text-xs font-bold uppercase tracking-wide ${hasAmountErr ? "text-red-500" : "text-gray-500"}`}>
                                  Total *
                                </label>
                                <span className="text-xs text-gray-400">Max: ${mainTotal.toFixed(2)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                                <input
                                  type="number"
                                  className={`w-full text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800 border ${hasAmountErr ? "border-red-400 ring-1 ring-red-300" : "border-blue-400"}`}
                                  value={split.purchasePrice ?? ""}
                                  onChange={(e) => updateSplitField(activeSplitIndex, "purchasePrice", e.target.value)}
                                  placeholder="0.00"
                                  min="0"
                                  max={mainTotal}
                                  step="0.01"
                                />
                              </div>
                              {hasAmountErr && (
                                <p className="mt-1 text-xs text-red-500">{fieldErr.amount}</p>
                              )}
                            </div>

                            {/* Describe Purchase */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Describe Purchase</label>
                              <input
                                type="text"
                                className="w-full border border-blue-400 text-sm px-2 py-2 rounded-md bg-white text-gray-800"
                                value={split.product_name || ""}
                                onChange={(e) => updateSplitField(activeSplitIndex, "product_name", e.target.value)}
                                maxLength={MAX_DESCRIPTION_LENGTH}
                                placeholder="Enter a description"
                              />
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* ── Split Overview ── */
                      <div className="space-y-4">
                        {/* Main Receipt Card */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Main Receipt</p>
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-bold text-gray-900 text-sm">{formData.storeName || "—"}</p>
                            <p className="font-bold text-gray-900 text-sm">${parseFloat(formData.purchasePrice || 0).toFixed(2)}</p>
                          </div>
                          {formData.subtotal && (
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>Subtotal</span>
                              <span>${parseFloat(formData.subtotal).toFixed(2)}</span>
                            </div>
                          )}
                          {(formData.receipt_tax_values || []).map((t, i) => (
                            <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                              <span>{t.tax_name} ({t.tax_rate}%)</span>
                              <span>${parseFloat(t.tax_amount || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Splits list — or empty state */}
                        {splits.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <p className="text-sm font-medium">No splits yet</p>
                            <p className="text-xs mt-1">Tap "Add Split" to create your first split.</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Splits</p>
                            <div className="space-y-3">
                              {splits.map((split, idx) => {
                                const hasErr = !!splitErrors[split._id];
                                return (
                                  <div
                                    key={split._id}
                                    className={`bg-white border rounded-xl p-4 cursor-pointer transition-colors ${hasErr ? "border-red-400" : "border-blue-200 hover:border-blue-400"}`}
                                    onClick={() => setActiveSplitIndex(idx)}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-800 text-sm">Split {idx + 1}</p>
                                        {hasErr && (
                                          <span className="text-xs text-red-500 font-medium">• Incomplete</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <p className={`font-bold text-sm ${parseFloat(split.purchasePrice) ? "text-blue-600" : "text-gray-400"}`}>
                                          {parseFloat(split.purchasePrice) ? `$${parseFloat(split.purchasePrice).toFixed(2)}` : "—"}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); removeSplit(idx); }}
                                          className="text-red-400 hover:text-red-600 p-1"
                                          title="Remove split"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                    {parseFloat(split.subtotal) > 0 && (
                                      <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>Subtotal</span>
                                        <span>${parseFloat(split.subtotal).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {(split.receipt_tax_values || []).filter(t => parseFloat(t.tax_amount) > 0).map((t, ti) => (
                                      <div key={ti} className="flex items-center justify-between text-xs text-gray-500">
                                        <span>{t.tax_name}</span>
                                        <span>${parseFloat(t.tax_amount).toFixed(2)}</span>
                                      </div>
                                    ))}
                                    {split.expense_type && (
                                      <p className="mt-1 text-xs text-gray-400">{split.expense_type}</p>
                                    )}
                                    {!parseFloat(split.purchasePrice) && !parseFloat(split.subtotal) && (
                                      <p className="text-xs text-gray-400 mt-1">Tap to fill in details →</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {/* Add Split Button */}
                        <button
                          type="button"
                          onClick={addSplit}
                          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 font-medium text-sm hover:border-blue-500 hover:bg-blue-50 transition-colors"
                        >
                          <Plus size={18} />
                          Add Split
                        </button>
                        {/* Error */}
                        {error && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                            {error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : step === "upload" ? (
                  <div className="p-6">
                    {/* Drop Zone */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`
                        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                        ${
                          isDragging
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
                        }
                        ${isUploading ? "pointer-events-none opacity-50" : ""}
                      `}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={isUploading}
                      />

                      <Upload
                        size={48}
                        className={`mx-auto mb-4 ${
                          isDragging ? "text-blue-500" : "text-gray-400"
                        }`}
                      />

                      <p className="text-gray-700 font-medium mb-2">
                        {isDragging
                          ? "Drop files here..."
                          : "Click to upload or drag and drop"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports images (JPG, PNG, GIF, WebP) and PDFs
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Maximum file size: 10MB per file
                      </p>
                    </div>
                    {/* Error Message */}
                    {error && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm whitespace-pre-line">
                        {error}
                      </div>
                    )}
                    {/* Selected Files */}
                    {files.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-semibold text-gray-900 mb-3">
                          Selected Files ({files.length})
                        </h3>
                        <div className="space-y-2">
                          {files.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-200 flex items-center justify-center">
                                {file.type.startsWith("image/") ? (
                                  <img
                                    src={getFilePreview(file)}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : file.type === "application/pdf" ? (
                                  pdfPreviewUrl ? (
                                    <img
                                      src={pdfPreviewUrl}
                                      alt="PDF Preview"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <FileText
                                      size={20}
                                      className="text-red-500"
                                    />
                                  )
                                ) : (
                                  <Image size={20} className="text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(index);
                                }}
                                disabled={isUploading}
                                className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-50 w-auto"
                              >
                                <Trash2 size={16} className="text-gray-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Upload Progress */}
                    {(isUploading || isParsing) && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            {isParsing
                              ? "Analyzing receipt..."
                              : "Uploading..."}
                          </span>
                          <span className="text-sm text-gray-500">
                            {isParsing
                              ? "Processing..."
                              : `${Math.round(uploadProgress)}%`}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: isParsing ? "50%" : `${uploadProgress}%`,
                            }}
                          />
                        </div>
                        {isParsing && (
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            Detecting merchant, date, payment method, and
                            fetching logo...
                          </p>
                        )}
                      </div>
                    )}
                    {showTaxDropdown === 1 && (
                      <div
                        key={`tax-dropdown-1-${taxDropdownKey}`}
                        className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto"
                      >
                        {/* existing content */}
                      </div>
                    )}
                    {showTaxDropdown === 2 && (
                      <div
                        key={`tax-dropdown-2-${taxDropdownKey}`}
                        className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto"
                      >
                        {/* existing content */}
                      </div>
                    )}
                    {/* Upload / Skip Buttons */}
                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSkipUpload}
                        disabled={isUploading || isParsing}
                        className="px-4 py-2 text-blue-700 font-medium bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Enter Manually
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || isUploading}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploading ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Form Step - Same layout as ReceiptDetail */
                  <form id="add-receipt-form" onSubmit={handleSaveReceipt}>
                    {/* Duplicate mode banner */}
                    {isDuplicateMode && (
                      <div className="mx-3 sm:mx-6 mt-3 px-4 py-3 bg-blue-50 border border-blue-300 rounded-lg flex items-center gap-2 text-blue-700 text-sm font-medium">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        You are editing a duplicate receipt. Save to create a new entry.
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-6 text-sm text-gray-800">
                      {/* Left Column - Receipt Information */}
                      {/* Left Column - Receipt Information */}
<div>
  <h3 className="font-bold mb-4 text-gray-900 text-left">
    RECEIPT INFORMATION
  </h3>

  {/* Expense Type */}
  <div className="mb-4 text-left">
    <label className="font-bold">Expense Type</label>
    <select
      className={inputClass}
      value={formData.receipt_category}
      onChange={(e) =>
        handleFieldChange("receipt_category", e.target.value)
      }
    >
      <option value="0">Personal</option>
      <option value="1">Business</option>
    </select>
  </div>

  {/* Date */}
  <div className="mb-4 text-left">
    <label className="font-bold">Date</label>
    <input
      type="date"
      className={inputClass}
      value={formData.product_date}
      onChange={(e) =>
        handleFieldChange("product_date", e.target.value)
      }
    />
  </div>

  {/* Merchant with Dropdown */}
  <div className="mb-4 text-left" ref={merchantInputRef}>
    <label className="font-bold">Merchant</label>
    <div className="relative w-full">
      {formData.storeName ? (
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10">
          <MerchantAvatar
            name={formData.storeName}
            explicitUrl={
              detectedMerchantLogo ||
              getMerchantImage(formData.storeName)
            }
            className="w-5 h-5 mt-2"
          />
        </div>
      ) : null}
      <input
        className={`${inputClass} ${formData.storeName ? "pl-8" : "pl-3"}`}
        value={formData.storeName}
        onChange={(e) => {
          const newMerchantName = stripEmoji(e.target.value);
          handleFieldChange("storeName", newMerchantName);
          // Clear detected logo when merchant changes manually
          if (
            newMerchantName !==
            uploadedReceiptData?.storeName
          ) {
            setDetectedMerchantLogo(null);
          }
          setIsMerchantTyping(true);
          setShowMerchantDropdown(true);
        }}
        onFocus={() => {
          setIsMerchantTyping(false); // Reset typing state when focusing
          setShowMerchantDropdown(true);
        }}
        onBlur={() => {
          // Delay to allow click events on dropdown items
          setTimeout(() => {
            setIsMerchantTyping(false);
            // Auto-fill expense category from merchant history if field is currently empty
            setFormData((prev) => {
              if (prev.expense_type || !prev.storeName?.trim()) return prev;
              const suggested = getMerchantDefaultCategory(prev.storeName);
              return suggested ? { ...prev, expense_type: suggested } : prev;
            });
          }, 200);
        }}
        placeholder="Select or type merchant name"
      />
      <ChevronDown
        size={16}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        onClick={() => {
          setIsMerchantTyping(false); // Show all when clicking chevron
          setShowMerchantDropdown(!showMerchantDropdown);
        }}
      />
      {showMerchantDropdown && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto">
          {/* Add Merchant Option - Always at the top */}
          <div
            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2 border-b border-gray-200 bg-blue-50"
            onClick={handleOpenAddMerchantModal}
          >
            <Plus size={16} className="text-blue-600" />
            <span className="font-medium text-blue-600">
              Add Merchant
            </span>
          </div>

          {/* Existing Merchants List */}
          {filteredMerchants.length > 0 && (
            <>
              {filteredMerchants.length > 0 ? (
                filteredMerchants.map((merchant, idx) => {
                  const isMisc = merchant.name.toLowerCase().trim() === "miscellaneous";
                  return (
                    <div
                      key={idx}
                      className="group px-3 py-2 hover:bg-blue-50 text-left flex items-center gap-2"
                    >
                      {/* Selectable area */}
                      <div
                        className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                        onClick={() => {
                          if (merchant.name !== uploadedReceiptData?.storeName) {
                            setDetectedMerchantLogo(null);
                          }
                          // Auto-fill expense category from receipt history when empty
                          const suggestedCategory = getMerchantDefaultCategory(merchant.name);
                          setFormData((prev) => ({
                            ...prev,
                            storeName: merchant.name,
                            ...(suggestedCategory && !prev.expense_type
                              ? { expense_type: suggestedCategory }
                              : {}),
                          }));
                          if (error) setError(null);
                          setIsMerchantTyping(false);
                          setShowMerchantDropdown(false);
                        }}
                      >
                        <MerchantAvatar
                          name={merchant.name}
                          explicitUrl={merchant.image}
                          className="w-5 h-5 mt-2 flex-shrink-0"
                        />
                        <span className="truncate">{merchant.name}</span>
                      </div>
                      {/* Edit / Delete — hidden for Miscellaneous, visible on hover */}
                      {!isMisc && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleOpenEditMerchant(merchant); }}
                            className="p-1 rounded hover:bg-blue-100 text-blue-500"
                            title="Edit merchant"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteMerchant(merchant); }}
                            className="p-1 rounded hover:bg-red-100 text-red-400"
                            title="Delete merchant"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-gray-500 text-sm text-center">
                  No merchants found
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  </div>

  {/* Expense Category with Dropdown */}
  <div className="mb-4 text-left" ref={categoryInputRef}>
    <label className="font-bold">Expense Category</label>
    <div className="relative">
      <input
        className={inputClass}
        value={formData.expense_type}
        onChange={(e) => {
          handleFieldChange("expense_type", e.target.value);
          setIsCategoryTyping(true);
          setShowCategoryDropdown(true);
        }}
        onFocus={() => {
          setIsCategoryTyping(false); // show all on focus
          setShowCategoryDropdown(true);
        }}
        placeholder="e.g., Restaurants, Fuel, General Retail"
      />
      <ChevronDown
        size={16}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        onClick={() => {
          setIsCategoryTyping(false); // show all when chevron clicked
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
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOpenEditCategory(category); }}
                    className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit category"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeletingCategory(category); setShowDeleteCategoryConfirm(true); setShowCategoryDropdown(false); }}
                    className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete category"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  </div>

  {/* Payment Method with Dropdown */}
  <div className="mb-4 text-left" ref={paymentInputRef}>
    <label className="font-bold">Payment Method</label>
    <div className="relative w-full">
      {(() => {
        // Use receipt object for logo detection
        // IMPORTANT: paymentType should be the card type (e.g., "PayPal") for logo detection
        // card_issuer_name is for display only (e.g., "Hello")
        const receiptForLogo = {
          paymentType: formData.paymentType, // Card type for logo (e.g., "PayPal", "Diners Club")
          card_issuer_name: formData.card_issuer_name, // Custom name for display (e.g., "Hello")
          last_4_digit_card: formData.last_4_digit_card,
        };
        const logo = getPaymentLogo(receiptForLogo);
        return logo ? (
          <img
            src={logo}
            alt={
              formData.card_issuer_name ||
              formData.paymentType ||
              ""
            }
            className="absolute left-2 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded z-10 mt-1"
          />
        ) : null;
      })()}
      <input
        className={`${inputClass} ${
          (() => {
            const receiptForLogo = {
              paymentType: formData.paymentType,
              card_issuer_name: formData.card_issuer_name,
              last_4_digit_card:
                formData.last_4_digit_card,
            };
            return getPaymentLogo(receiptForLogo);
          })()
            ? "pl-8"
            : ""
        }`}
        value={(() => {
          const display = getPaymentDisplay({
            paymentType: formData.paymentType,
            card_issuer_name: formData.card_issuer_name,
            last_4_digit_card: formData.last_4_digit_card,
          });
          return display === "-" ? "" : display;
        })()}
        onChange={(e) => {
          // Extract card issuer name and last4 from input
          const inputValue = e.target.value;
          const parts = inputValue.split("*");
          const cardIssuerName = parts[0]?.trim() || "";
          const last4 = parts[1]?.trim() || "";

          // Check if we have a matching localPaymentMethod with selectedCardType
          // This handles the case where user previously added a payment method via modal
          const matchingLocalMethod =
            localPaymentMethods.find((pm) => {
              const pmIssuer = pm.cardIssuerName || "";
              const pmLast4 = pm.last4DigitCard || "";
              const pmDisplay =
                pmIssuer && pmLast4
                  ? `${pmIssuer} *${pmLast4}`
                  : pmIssuer || pm.paymentType || "";
              // Match by display format or by issuer name
              return (
                pmDisplay === inputValue ||
                (pmIssuer === cardIssuerName &&
                  pmLast4 === last4) ||
                (pmIssuer === cardIssuerName &&
                  !last4 &&
                  !pmLast4)
              );
            });

          let cardType = cardIssuerName; // Default to issuer name

          // Use selectedCardType from localPaymentMethod if available (for logo)
          if (matchingLocalMethod && matchingLocalMethod.selectedCardType) {
            cardType = matchingLocalMethod.selectedCardType;
          } else {
            // 1. API card_type is authoritative
            const _apiRecForChange = (apiPaymentMethods || []).find(
              (p) => apiPaymentMethodMatchesLabel(p, inputValue)
            );
            const _brandForChange = _apiRecForChange ? cardTypeIntToBrand(_apiRecForChange.card_type) : null;

            if (_brandForChange && _brandForChange !== "Other") {
              cardType = _brandForChange;
            } else {
              // 2. Keyword detection on issuer name
              const issuerLower = cardIssuerName.toLowerCase();
              if (issuerLower.includes("paypal"))
                cardType = "PayPal";
              else if (issuerLower.includes("visa"))
                cardType = "Visa";
              else if (issuerLower.includes("master"))
                cardType = "MasterCard";
              else if (issuerLower.includes("amex") || issuerLower.includes("american express"))
                cardType = "American Express";
              else if (issuerLower.includes("discover"))
                cardType = "Discover";
              else if (issuerLower.includes("diners"))
                cardType = "Diners Club";
              else if (issuerLower.includes("debit"))
                cardType = "Debit Card";
              else if (issuerLower.includes("cash"))
                cardType = "Cash";
              else if (issuerLower === "other")
                cardType = "Other";
              // If no card type detected, keep the issuer name (will show generic logo)
            }
          }

          // Update paymentType (for API - card type for logo detection)
          handleFieldChange("paymentType", cardType);

          const safeIssuerName = cardIssuerName.replace(/\s*\*\d{3,4}$/, "").trim();
          handleFieldChange(
            "card_issuer_name",
            storedCardIssuerName(safeIssuerName, cardType),
          );

          // Update last_4_digit_card
          if (last4 && /^\d{3,4}$/.test(last4)) {
            handleFieldChange("last_4_digit_card", last4);
          } else {
            handleFieldChange("last_4_digit_card", "");
          }

          setIsPaymentTyping(true);
          setShowPaymentDropdown(true);
        }}
        onFocus={() => {
          setIsPaymentTyping(false); // Reset typing state when focusing
          setShowPaymentDropdown(true);
        }}
        onBlur={() => {
          // Delay to allow click events on dropdown items
          setTimeout(() => {
            setIsPaymentTyping(false);
          }, 200);
        }}
        placeholder="Select or type payment method"
      />
      <ChevronDown
        size={16}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        onClick={() => {
          setIsPaymentTyping(false); // Show all when clicking chevron
          setShowPaymentDropdown(!showPaymentDropdown);
        }}
      />
      {showPaymentDropdown && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto">
          {/* Add Payment Method Option - Always at the top */}
          <div
            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2 border-b border-gray-200 bg-blue-50"
            onClick={handleOpenAddPaymentModal}
          >
            <Plus size={16} className="text-blue-600" />
            <span className="font-medium text-blue-600">
              Add Payment Method
            </span>
          </div>

          {/* Existing Payment Methods List */}
          {filteredPaymentMethods.length > 0 ? (
            filteredPaymentMethods.map((method, idx) => {
              // Display format: card issuer name *last4 (e.g., "Omi *8888")
              const methodString =
                typeof method === "string"
                  ? method
                  : method?.paymentType || String(method);

              // Find matching localPaymentMethod if this is from localPaymentMethods
              const matchingLocalMethod =
                localPaymentMethods.find((pm) => {
                  const issuerName =
                    pm.cardIssuerName || "";
                  const last4 = pm.last4DigitCard || "";
                  const displayFormat =
                    issuerName && last4
                      ? `${issuerName} *${last4}`
                      : issuerName ||
                        pm.paymentType ||
                        "";
                  return displayFormat === methodString;
                });

              // Extract issuer name and last4 for display
              let issuerName = "";
              let last4 = "";

              if (matchingLocalMethod) {
                // Use data from localPaymentMethod
                issuerName =
                  matchingLocalMethod.cardIssuerName ||
                  "";
                last4 =
                  matchingLocalMethod.last4DigitCard ||
                  "";
              } else {
                // Extract from method string (format: "Issuer Name *1234")
                const parts = methodString.split("*");
                issuerName = parts[0]?.trim() || "";
                if (parts[1]) {
                  last4 =
                    parts[1]
                      ?.trim()
                      .replace(/\D/g, "")
                      .slice(-4) || "";
                }
              }

              const _pctForLabel = readPayCardTypeMap();
              const brandForLabel =
                matchingLocalMethod?.selectedCardType ||
                _pctForLabel[methodString] ||
                inferCardTypeFromPayment(methodString);
              const displayText = getPaymentMethodListLabel(
                last4 ? `${issuerName || brandForLabel} *${last4}` : methodString,
                brandForLabel
              );

              const isCashItem = isCashPaymentMethod(methodString);
              return (
                <div
                  key={`payment-${methodString}-${idx}`}
                  className="px-3 py-2 hover:bg-blue-50 text-left flex items-center gap-2"
                  style={{ cursor: "default" }}
                >
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => {
                    // Use the already extracted issuerName and last4 (they handle both localPaymentMethods and method strings correctly)
                    const cardIssuerName = issuerName;
                    const finalLast4 = last4;

                    // If this is from localPaymentMethods, use selectedCardType for paymentType (logo detection)
                    if (
                      matchingLocalMethod &&
                      matchingLocalMethod.selectedCardType
                    ) {
                      // Use selectedCardType for paymentType (for logo detection)
                      handleFieldChange(
                        "paymentType",
                        matchingLocalMethod.selectedCardType,
                      );
                      handleFieldChange(
                        "card_issuer_name",
                        storedCardIssuerName(
                          matchingLocalMethod.cardIssuerName || cardIssuerName,
                          matchingLocalMethod.selectedCardType
                        ),
                      );
                    } else {
                      // For methods from allPaymentMethods, resolve cardType for logo detection.
                      // Priority: 1) API card_type integer  2) issuer keyword  3) receipt lookup  4) saved map
                      const baseName = cardIssuerName.toLowerCase();
                      let cardType = cardIssuerName; // Default

                      // 1. API card_type is authoritative (e.g. card_type=5 → "Diners Club")
                      const _apiRecForClick = (apiPaymentMethods || []).find(
                        (p) => apiPaymentMethodMatchesLabel(p, methodString)
                      );
                      const _brandFromApi = _apiRecForClick ? cardTypeIntToBrand(_apiRecForClick.card_type) : null;

                      if (_brandFromApi && _brandFromApi !== "Other") {
                        cardType = _brandFromApi;
                      } else if (baseName.includes("visa")) {
                        cardType = "Visa";
                      } else if (baseName.includes("master")) {
                        cardType = "MasterCard";
                      } else if (baseName.includes("paypal")) {
                        cardType = "PayPal";
                      } else if (baseName.includes("amex") || baseName.includes("american express")) {
                        cardType = "American Express";
                      } else if (baseName.includes("discover")) {
                        cardType = "Discover";
                      } else if (baseName.includes("diners")) {
                        cardType = "Diners Club";
                      } else if (baseName.includes("debit")) {
                        cardType = "Debit Card";
                      } else if (baseName.includes("cash")) {
                        cardType = "Cash";
                      } else {
                        // Issuer name doesn't contain a known card network keyword.
                        // Look up a matching receipt for its paymentType.
                        const matchingReceiptForCardType = (receipts || []).find(
                          (r) => getPaymentDisplay(r) === methodString,
                        );
                        const receiptPaymentType = (
                          matchingReceiptForCardType?.paymentType ||
                          matchingReceiptForCardType?.payment_type ||
                          ""
                        ).replace(/\s*\*\d{3,4}$/, "").trim();

                        const receiptTypeLower = receiptPaymentType.toLowerCase();
                        if (receiptTypeLower.includes("visa"))
                          cardType = "Visa";
                        else if (receiptTypeLower.includes("master"))
                          cardType = "MasterCard";
                        else if (receiptTypeLower.includes("paypal"))
                          cardType = "PayPal";
                        else if (receiptTypeLower.includes("amex") || receiptTypeLower.includes("american express"))
                          cardType = "American Express";
                        else if (receiptTypeLower.includes("discover"))
                          cardType = "Discover";
                        else if (receiptTypeLower.includes("diners"))
                          cardType = "Diners Club";
                        else if (receiptTypeLower.includes("debit"))
                          cardType = "Debit Card";
                        else {
                          const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
                          cardType = _pct[methodString] || cardIssuerName;
                        }
                      }

                      handleFieldChange("paymentType", cardType);
                      handleFieldChange(
                        "card_issuer_name",
                        storedCardIssuerName(cardIssuerName, cardType),
                      );
                    }

                    // Set last_4_digit_card (use the already extracted last4)
                    if (
                      finalLast4 &&
                      /^\d{3,4}$/.test(finalLast4)
                    ) {
                      handleFieldChange(
                        "last_4_digit_card",
                        finalLast4,
                      );
                    } else {
                      // Clear if invalid
                      handleFieldChange(
                        "last_4_digit_card",
                        "",
                      );
                    }

                    // Auto-apply Personal/Business preference saved in Settings
                    const _petMap = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
                    const _storedExpType = _petMap[methodString] || _petMap[displayText];
                    if (_storedExpType === "Business") {
                      handleFieldChange("receipt_category", "1");
                    } else if (_storedExpType === "Personal") {
                      handleFieldChange("receipt_category", "0");
                    }

                    setIsPaymentTyping(false);
                    setShowPaymentDropdown(false);
                  }}
                >
                  {(() => {
                    // Logo priority:
                    // 1. API card_type integer (most authoritative — fixes e.g. Citibank=Visa)
                    // 2. Local method's selectedCardType
                    // 3. Matching receipt's paymentType
                    // 4. Settings-saved cat_pay_card_types map
                    // 5. Raw method string keyword detection
                    let logo;
                    const apiRec = (apiPaymentMethods || []).find(
                      (p) => apiPaymentMethodMatchesLabel(p, methodString)
                    );
                    if (apiRec) {
                      const brandFromApi = cardTypeIntToBrand(apiRec.card_type);
                      if (brandFromApi) {
                        logo = getPaymentLogo({ paymentType: brandFromApi, card_issuer_name: issuerName });
                      }
                    }
                    if (!logo) {
                      if (matchingLocalMethod?.selectedCardType) {
                        logo = getPaymentLogo({
                          paymentType: matchingLocalMethod.selectedCardType,
                          card_issuer_name: issuerName,
                        });
                      } else {
                        const matchingReceipt = (receipts || []).find(
                          (r) => getPaymentDisplay(r) === methodString,
                        );
                        if (matchingReceipt) {
                          logo = getPaymentLogo(matchingReceipt);
                        } else {
                          // Check Settings-saved card type map (cat_pay_card_types)
                          const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
                          const _ct = _pct[methodString];
                          logo = getPaymentLogo({ paymentType: _ct || methodString, card_issuer_name: issuerName });
                        }
                      }
                    }
                    return logo ? (
                      <img
                        src={logo}
                        alt={displayText}
                        className="w-5 h-5 rounded object-contain mt-2"
                      />
                    ) : null;
                  })()}
                  <span style={{ flex: 1 }}>{displayText}</span>
                </div>
                {/* Edit / Delete icons — not shown for Cash */}
                {!isCashItem && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Edit payment method"
                      onClick={(e) => { e.stopPropagation(); handleEditPaymentInDropdown(methodString); }}
                      style={{ padding: "2px 5px", borderRadius: 6, background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Pencil size={11} style={{ color: "#2563eb" }} />
                    </button>
                    <button
                      type="button"
                      title="Delete payment method"
                      onClick={(e) => { e.stopPropagation(); handleDeletePaymentInDropdown(methodString); }}
                      style={{ padding: "2px 5px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Trash2 size={11} style={{ color: "#dc2626" }} />
                    </button>
                  </div>
                )}
                </div>
              );
            })
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm text-center">
              No payment methods found
            </div>
          )}
        </div>
      )}
    </div>
  </div>
</div>

                      {/* Right Column - Receipt Totals */}
                      <div>
                        <h3 className="font-bold mb-4 text-gray-900 text-left">
                          RECEIPT TOTALS
                        </h3>

                        {/* Subtotal */}
                        <div className="mb-4 text-align-left">
                          <label className="font-bold">Subtotal</label>
                          <input
                            type="text"
                            readOnly
                            className={`${inputClass} ${parseFloat(formData.subtotal) < 0 ? "text-red-600 font-medium" : ""}`}
                            value={formatCurrencyDisplay(formData.subtotal)}
                            placeholder="$0.00"
                          />
                        </div>

                        {/* Tax Type #1 with Add button */}
                        {formData.receipt_tax_values[0] ? (
                        <div className="mb-4 text-align-left">
                          <div className="flex items-center justify-between">
                            <label className="font-bold">
                              {`${formData.receipt_tax_values[0].tax_name} (${formatTaxRate(formData.receipt_tax_values[0].tax_rate)}%)`}
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => removeTaxType(0)}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Remove tax type"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              className={`${inputClass} ${parseFloat(formData.receipt_tax_values[0]?.tax_amount) < 0 ? "text-red-600 font-medium" : ""}`}
                              value={
                                currencyInputs.tax0 ||
                                formatCurrencyDisplay(formData.receipt_tax_values[0]?.tax_amount)
                              }
                              onFocus={() => {
                                const num = parseFloat(formData.receipt_tax_values[0]?.tax_amount);
                                setCurrencyInput("tax0", !num || num === 0 ? "$" : formatCurrencyDisplay(num));
                              }}
                              onKeyDown={preventInvalidMoneyKey}
                              onChange={(e) => {
                                const normalized = normalizeCurrencyInput(e.target.value);
                                setCurrencyInput("tax0", normalized);
                                updateTaxAmount(0, parseCurrencyToNumber(normalized));
                              }}
                              onBlur={() => {
                                const num = parseFloat(formData.receipt_tax_values[0]?.tax_amount);
                                updateTaxAmount(0, !num || isNaN(num) ? "" : num.toFixed(2));
                                setCurrencyInput("tax0", "");
                              }}
                              placeholder="$0.00"
                            />
                          </div>
                        </div>
                        ) : null}
                            {showTaxDropdown === 1 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                {(() => {
                                  console.log(
                                    "=== Tax Dropdown #1 Rendered ===",
                                  );
                                  console.log("allTaxTypes:", allTaxTypes);
                                  console.log(
                                    "allTaxTypes length:",
                                    allTaxTypes.length,
                                  );
                                  return null;
                                })()}
                                <>
                                    <div
                                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium flex items-center gap-1 border-b border-gray-200"
                                      onClick={() => {
                                        setShowTaxDropdown(false);
                                        setShowManageTaxModal(true);
                                      }}
                                    >
                                      <Plus size={14} className="inline" />
                                      Manage Tax Types
                                    </div>
                                    {allTaxTypes.length > 0 ? (
                                      [...allTaxTypes]
                                        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""))
                                        .map((tax, idx) => {
                                        return (
                                          <div
                                            key={idx}
                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm"
                                            onClick={() => {
                                              addTaxType(tax);
                                              setShowTaxDropdown(false);
                                            }}
                                          >
                                            {tax.tax_name} ({formatTaxRate(tax.tax_rate)}%)
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="px-3 py-2 text-gray-500 text-sm">
                                        No tax types available
                                      </div>
                                    )}
                                  </>
                              </div>
                            )}

                        {/* Tax Type #2 with Add button */}
                        {formData.receipt_tax_values[1] ? (
                        <div className="mb-4 text-align-left">
                          <div className="flex items-center justify-between">
                            <label className="font-bold">
                              {`${formData.receipt_tax_values[1].tax_name} (${formatTaxRate(formData.receipt_tax_values[1].tax_rate)}%)`}
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => removeTaxType(1)}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Remove tax type"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              className={`${inputClass} ${parseFloat(formData.receipt_tax_values[1]?.tax_amount) < 0 ? "text-red-600 font-medium" : ""}`}
                              value={
                                currencyInputs.tax1 ||
                                formatCurrencyDisplay(formData.receipt_tax_values[1]?.tax_amount)
                              }
                              onFocus={() => {
                                const num = parseFloat(formData.receipt_tax_values[1]?.tax_amount);
                                setCurrencyInput("tax1", !num || num === 0 ? "$" : formatCurrencyDisplay(num));
                              }}
                              onKeyDown={preventInvalidMoneyKey}
                              onChange={(e) => {
                                const normalized = normalizeCurrencyInput(e.target.value);
                                setCurrencyInput("tax1", normalized);
                                updateTaxAmount(1, parseCurrencyToNumber(normalized));
                              }}
                              onBlur={() => {
                                const num = parseFloat(formData.receipt_tax_values[1]?.tax_amount);
                                updateTaxAmount(1, !num || isNaN(num) ? "" : num.toFixed(2));
                                setCurrencyInput("tax1", "");
                              }}
                              placeholder="$0.00"
                            />
                          </div>
                        </div>
                        ) : null}
                            {showTaxDropdown === 2 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                {(() => {
                                  console.log(
                                    "=== Tax Dropdown #2 Rendered ===",
                                  );
                                  console.log("allTaxTypes:", allTaxTypes);
                                  console.log(
                                    "allTaxTypes length:",
                                    allTaxTypes.length,
                                  );
                                  return null;
                                })()}
                                <>
                                    <div
                                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium flex items-center gap-1 border-b border-gray-200"
                                      onClick={() => {
                                        setShowTaxDropdown(false);
                                        setShowManageTaxModal(true);
                                      }}
                                    >
                                      <Plus size={14} className="inline" />
                                      Manage Tax Types
                                    </div>
                                    {allTaxTypes.length > 0 ? (
                                      [...allTaxTypes]
                                        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""))
                                        .map((tax, idx) => {
                                        return (
                                          <div
                                            key={idx}
                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm"
                                            onClick={() => {
                                              addTaxType(tax);
                                              setShowTaxDropdown(false);
                                            }}
                                          >
                                            {tax.tax_name} ({formatTaxRate(tax.tax_rate)}%)
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="px-3 py-2 text-gray-500 text-sm">
                                        No tax types available
                                      </div>
                                    )}
                                  </>
                              </div>
                            )}

                        {/* TIP — only visible when TIP pill is selected */}
                        {formData.tip !== "" && (
                          <div className="mb-4 text-align-left">
                            <div className="flex items-center justify-between">
                              <label className="font-bold">
                                TIP (
                                {formData.tip !== "" &&
                                formData.subtotal &&
                                parseFloat(formData.subtotal) > 0
                                  ? `${Math.round(
                                      (parseFloat(formData.tip) /
                                        parseFloat(formData.subtotal)) *
                                        100,
                                    )}%`
                                  : "0%"}
                                )
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleFieldChange("tip", "");
                                    setCurrencyInput("tip", "");
                                  }}
                                  className="text-red-600 hover:text-red-800 p-1"
                                  title="Remove tip"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <input
                              id="add-receipt-tip-input"
                              type="text"
                              inputMode="decimal"
                              className={inputClass}
                              value={
                                currencyInputs.tip ||
                                formatCurrencyDisplay(formData.tip)
                              }
                              onFocus={() => {
                                const num = parseFloat(formData.tip);
                                setCurrencyInput("tip", !num || num === 0 ? "$" : formatCurrencyDisplay(num));
                              }}
                              onKeyDown={preventInvalidMoneyKey}
                              onChange={(e) => {
                                const normalized = normalizeCurrencyInput(e.target.value);
                                setCurrencyInput("tip", normalized);
                                handleFieldChange("tip", parseCurrencyToNumber(normalized));
                              }}
                              onBlur={() => {
                                const num = parseFloat(formData.tip);
                                handleFieldChange("tip", isNaN(num) ? "" : num.toFixed(2));
                                setCurrencyInput("tip", "");
                              }}
                              placeholder="$0.00"
                            />
                          </div>
                        )}

                        {/* Total */}
                        <div className="mb-4 text-align-left">
                          <label className="font-bold">TOTAL</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={`${inputClass} ${parseFloat(formData.purchasePrice) < 0 ? "text-red-600 font-medium" : ""}`}
                            value={
                              currencyInputs.total ||
                              formatCurrencyDisplay(formData.purchasePrice)
                            }
                            onFocus={() => {
                              const num = parseFloat(formData.purchasePrice);
                              setCurrencyInput("total", !num || num === 0 ? "$" : formatCurrencyDisplay(num));
                            }}
                            onKeyDown={preventInvalidMoneyKey}
                            onChange={(e) => {
                              const normalized = normalizeCurrencyInput(e.target.value);
                              setCurrencyInput("total", normalized);
                              handleFieldChange("purchasePrice", parseCurrencyToNumber(normalized));
                            }}
                            onBlur={() => {
                              const num = parseFloat(formData.purchasePrice);
                              handleFieldChange("purchasePrice", !num || isNaN(num) ? "" : num.toFixed(2));
                              setCurrencyInput("total", "");
                            }}
                            placeholder="$0.00"
                          />
                        </div>

                        {/* SELECT — tax/tip pill selector */}
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Select</p>

                          {/* Row 1: Manage Tax Types + TIP on same line */}
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowTaxDropdown(false);
                                setShowManageTaxModal(true);
                              }}
                              className="px-4 py-1.5 rounded-full border border-blue-400 text-blue-600 bg-blue-50 text-sm font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-blue-100 transition-all"
                            >
                              <Plus size={12} /> Manage Tax Types
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (formData.tip !== "") {
                                  handleFieldChange("tip", "");
                                } else {
                                  handleFieldChange("tip", "0");
                                  setTimeout(() => {
                                    document.getElementById("add-receipt-tip-input")?.focus();
                                  }, 50);
                                }
                              }}
                              className={`px-4 py-1.5 rounded-full border text-sm font-semibold transition-all ${
                                formData.tip !== ""
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
                            {[...allTaxTypes]
                              .map((tax) => ({
                                ...tax,
                                _selIdx: formData.receipt_tax_values.findIndex((t) =>
                                  taxTypesMatch(t, tax)
                                ),
                              }))
                              .sort((a, b) => {
                                const aS = a._selIdx !== -1;
                                const bS = b._selIdx !== -1;
                                if (aS && !bS) return -1;
                                if (!aS && bS) return 1;
                                return a.tax_name.localeCompare(b.tax_name);
                              })
                              .map((tax, idx) => {
                                const isSelected = tax._selIdx !== -1;
                                const atMaxTaxTypes =
                                  formData.receipt_tax_values.length >= MAX_RECEIPT_TAX_TYPES;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        removeTaxType(tax._selIdx);
                                      } else if (atMaxTaxTypes) {
                                        setAlertMsg(MAX_RECEIPT_TAX_MSG);
                                      } else {
                                        addTaxType(tax);
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
                      </div>
                    </div>

                    {/* More Information Section */}
                    <h2 className="font-semibold mb-2 text-gray-900 text-align-left px-6">
                      MORE INFORMATION
                    </h2>

                    <div className="px-6 pb-4 text-align-left mb-4">
                      <h3 className="font-semibold mb-2 text-gray-900">
                        Describe Purchase
                      </h3>
                      <textarea
                        className={`w-full border rounded-md p-2 mb-1 text-sm ${descriptionOverflow ? "border-red-400 bg-red-50" : "border-blue-400"}`}
                        value={formData.product_name || ""}
                        onChange={(e) =>
                          handleFieldChange("product_name", e.target.value)
                        }
                        placeholder="e.g., Nespresso VertuoPlus Espresso Maker"
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
                        value={formData.notes || ""}
                        onChange={(e) =>
                          handleFieldChange("notes", e.target.value)
                        }
                        placeholder="e.g., Birthday gift for Mom"
                        rows={6}
                      />
                      {notesOverflow && (
                        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> Character limit of {MAX_NOTES_LENGTH} exceeded
                        </div>
                      )}

                      {/* Tags Section - Same as ReceiptDetail */}
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
                            .sort((a, b) => (tags[b.key] ? 1 : 0) - (tags[a.key] ? 1 : 0))
                            .map(({ key, label }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleTag(key)}
                                className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                                  tags[key]
                                    ? "border-blue-500 text-blue-600"
                                    : "border-gray-300"
                                }`}
                              >
                                <img
                                  src={getTagImage(key, tags[key])}
                                  alt={label}
                                  className="w-4 h-4 object-contain"
                                />
                                <span className="text-xs font-medium">{label}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Receipt Image Section */}
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
                        {uploadedMediaUrls.length > 0 ? (
                          // Show all uploaded media.
                          uploadedMediaUrls.map((url, idx) => {
                            const safeUrl = (url || "").toString().trim();
                            // Detect PDF per media item URL only.
                            // Do not infer from localImageFile type, otherwise an
                            // annotated PNG can be incorrectly treated as PDF and disappear.
                            const isPdf = isPdfUrl(safeUrl);
                            const isRemotePdf =
                              isPdf && /^https?:\/\//i.test(safeUrl);
                            const displayUrl = isPdf && !isRemotePdf
                              ? pdfPreviewUrl || getImagePreviewUrl()
                              : safeUrl;

                            if (isRemotePdf) {
                              return (
                                <div key={idx} className="relative group">
                                  <PdfThumbnail
                                    url={safeUrl}
                                    className="w-24 h-[118px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeUploadedMediaAt(idx);
                                    }}
                                    className="absolute top-1 right-1 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                    title="Delete image"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              );
                            }

                            if (isPdf && !displayUrl) {
                              return (
                                <div key={idx} className="relative group">
                                  <button
                                    type="button"
                                    onClick={() => window.open(safeUrl, "_blank")}
                                    className="w-24 h-[118px] rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors flex flex-col items-center justify-center text-gray-600"
                                    title="Open PDF"
                                  >
                                    <FileText size={26} />
                                    <span className="mt-1 text-[11px] font-semibold">PDF</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeUploadedMediaAt(idx);
                                    }}
                                    className="absolute top-1 right-1 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                    title="Delete image"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              );
                            }

                            if (!displayUrl) return null;

                            return (
                              <div key={idx} className="relative group">
                                <img
                                  src={displayUrl}
                                  alt={`Receipt ${idx + 1}`}
                                  className="w-24 h-auto rounded cursor-pointer border border-gray-200"
                                  onClick={() => window.open(safeUrl, "_blank")}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeUploadedMediaAt(idx);
                                  }}
                                  className="absolute top-1 right-1 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                  title="Delete image"
                                >
                                  <Trash2 size={11} />
                                </button>
                                {/* Annotate button overlay */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAnnotatorUrl(displayUrl);
                                    setAnnotatorIndex(idx);
                                  }}
                                  className="absolute bottom-1 right-1 bg-white/90 hover:bg-blue-600 hover:text-white text-gray-700 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                  title="Annotate / Write on this receipt"
                                >
                                  <PenLine size={11} />
                                </button>
                              </div>
                            );
                          })
                        ) : getImagePreviewUrl() ? (
                          <div className="relative group">
                            <img
                              src={getImagePreviewUrl()}
                              alt="Receipt"
                              className="w-24 h-auto rounded cursor-pointer border border-gray-200"
                              onClick={() =>
                                window.open(getImagePreviewUrl(), "_blank")
                              }
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedImageUrl(null);
                                setPdfPreviewUrl(null);
                                setLocalImageFile(null);
                                setUploadedReceiptData((prev) => {
                                  if (!prev) return prev;
                                  return { ...prev, receipt_image: "0", emailAttachment: "0" };
                                });
                              }}
                              className="absolute top-1 right-1 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                              title="Delete image"
                            >
                              <Trash2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnnotatorUrl(getImagePreviewUrl());
                                setAnnotatorIndex(-1);
                              }}
                              className="absolute bottom-1 right-1 bg-white/90 hover:bg-blue-600 hover:text-white text-gray-700 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                              title="Annotate / Write on this receipt"
                            >
                              <PenLine size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center w-full py-6 text-gray-400 gap-2">
                            <Camera size={28} className="opacity-40" />
                            <span className="text-sm italic">No receipt image — tap &quot;Add Photo&quot; to upload one</span>
                          </div>
                        )}
                      </div>

                      {/* Save button is in the sticky footer below */}
                    </div>
                  </form>
                )}
              </div>

              {/* ── Sticky Save Bar ── only on form step */}
              {step === "form" && !showSplitScreen && (
                <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 py-3">
                  <button
                    type="submit"
                    form="add-receipt-form"
                    disabled={isSaving}
                    className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSaving ? "Saving..." : "Save Receipt"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Save Loading Overlay */}
      <AnimatePresence>
        {isSaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[200px]">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-700 font-semibold text-base">Saving receipt...</p>
              <p className="text-gray-400 text-sm">Please wait</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        generalError={error}
        onClose={handleCloseAddPaymentModal}
        onSave={handleAddPaymentMethod}
        onCardTypeChange={setNewPaymentCardType}
        onIssuerChange={setNewCardIssuerName}
        onLast4Change={setNewLast4Digits}
        onCategoryChange={setNewPaymentCategoryType}
      />

      {/* Edit Merchant Modal - Overlay on top of Add Receipt Modal */}
      <AnimatePresence>
        {showEditMerchantModal && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isSavingEditMerchant) setShowEditMerchantModal(false); }}
          >
            <motion.div
              variants={modalVariants}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Saving Overlay */}
              {isSavingEditMerchant && (
                <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center rounded-xl">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Updating all receipts…</p>
                </div>
              )}

              {/* Modal Header */}
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

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Merchant Name Field */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Merchant Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`${inputClass} w-full`}
                    value={editMerchantName}
                    onChange={(e) => {
                      setEditMerchantName(e.target.value);
                      setEditLogoOptions([]);
                      setEditSelectedLogoIndex(null);
                      if (editMerchantError === "Merchant already exists") setEditMerchantError(null);
                    }}
                    placeholder="Enter merchant name"
                    autoFocus
                    disabled={isSavingEditMerchant}
                  />
                </div>

                {editMerchantDuplicateError && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    <AlertCircle size={14} />
                    {editMerchantDuplicateError}
                  </div>
                )}

                {/* Merchant Logo Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-gray-700">
                      Merchant Logo
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchEditLogos}
                      disabled={!editMerchantName.trim() || isFetchingEditLogos || isSavingEditMerchant}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isFetchingEditLogos ? "Fetching…" : "Search Logos"}
                    </button>
                  </div>

                  {/* Currently selected / existing logo preview */}
                  {editMerchantLogo && editSelectedLogoIndex === null && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Current:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <img
                          src={editMerchantLogo}
                          alt="Current merchant logo"
                          className="max-w-full max-h-16 w-auto h-auto object-contain"
                          style={{ imageRendering: "auto" }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Logo Options Grid */}
                  {isFetchingEditLogos && (
                    <div className="text-center py-8 text-gray-500">Fetching logo options…</div>
                  )}

                  {!isFetchingEditLogos && editLogoOptions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-3">
                        Select a logo ({editLogoOptions.length} options found):
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
                        {editLogoOptions.map((logo, index) => (
                          <div
                            key={index}
                            className={`relative cursor-pointer border-2 rounded-lg transition-all flex items-center justify-center p-2 min-h-[80px] ${
                              editSelectedLogoIndex === index
                                ? "border-blue-600 ring-2 ring-blue-300"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => handleSelectEditLogo(index)}
                          >
                            <img
                              src={logo.displayUrl}
                              alt={`Logo option ${index + 1}`}
                              className="max-w-full max-h-16 w-auto h-auto object-contain"
                              style={{ imageRendering: "auto" }}
                              onError={(e) => {
                                if (e.target.src !== logo.storeUrl) {
                                  e.target.src = logo.storeUrl;
                                } else {
                                  e.target.style.display = "none";
                                  e.target.parentElement.innerHTML =
                                    '<div class="w-full min-h-[80px] flex items-center justify-center text-xs text-gray-400">Failed to load</div>';
                                }
                              }}
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

                  {/* Selected Logo Preview (after picking from grid) */}
                  {editMerchantLogo && editSelectedLogoIndex !== null && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Selected:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <img
                          src={editMerchantLogo}
                          alt="Selected merchant logo"
                          className="max-w-full max-h-16 w-auto h-auto object-contain"
                          style={{ imageRendering: "auto" }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {editMerchantError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {editMerchantError}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { if (!isSavingEditMerchant) setShowEditMerchantModal(false); }}
                    disabled={isSavingEditMerchant}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditMerchant}
                    disabled={!editMerchantName.trim() || isSavingEditMerchant || !!editMerchantDuplicateError}
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

      {/* Add Merchant Modal - Overlay on top of Add Receipt Modal */}
      <AnimatePresence>
        {showAddMerchantModal && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleCloseAddMerchantModal}
          >
            <motion.div
              variants={modalVariants}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
                <h2 className="text-xl font-bold text-gray-900">
                  Add New Merchant
                </h2>
                <button
                  onClick={handleCloseAddMerchantModal}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Merchant Name Field */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Merchant Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`${inputClass} w-full`}
                    value={newMerchantName}
                    onChange={(e) => {
                      setNewMerchantName(stripEmoji(e.target.value));
                      setLogoOptions([]);
                      setSelectedLogoIndex(null);
                      setNewMerchantLogo("");
                    }}
                    placeholder="Enter merchant name"
                    autoFocus
                  />
                </div>

                {/* Merchant Logo Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-gray-700">
                      Merchant Logo <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchLogos}
                      disabled={!newMerchantName || isFetchingLogos}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isFetchingLogos ? "Fetching..." : "Search Logos"}
                    </button>
                  </div>

                  {/* Logo Options Grid */}
                  {isFetchingLogos && (
                    <div className="text-center py-8 text-gray-500">
                      Fetching logo options...
                    </div>
                  )}

                  {!isFetchingLogos && logoOptions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-3">
                        Select a logo ({logoOptions.length} options found):
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
                        {logoOptions.map((logo, index) => (
                          <div
                            key={index}
                            className={`relative cursor-pointer border-2 rounded-lg transition-all flex items-center justify-center p-2 min-h-[80px] ${
                              selectedLogoIndex === index
                                ? "border-blue-600 ring-2 ring-blue-300"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => handleSelectLogo(index)}
                          >
                            <img
                              src={logo.displayUrl}
                              alt={`Logo option ${index + 1}`}
                              className="max-w-full max-h-16 w-auto h-auto object-contain"
                              style={{ imageRendering: "auto" }}
                              onError={(e) => {
                                // fallback: try storeUrl if displayUrl failed
                                if (e.target.src !== logo.storeUrl) {
                                  e.target.src = logo.storeUrl;
                                } else {
                                  e.target.style.display = "none";
                                  e.target.parentElement.innerHTML =
                                    '<div class="w-full min-h-[80px] flex items-center justify-center text-xs text-gray-400">Failed to load</div>';
                                }
                              }}
                            />
                            {selectedLogoIndex === index && (
                              <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-1 z-10">
                                <svg
                                  className="w-4 h-4 text-white"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isFetchingLogos &&
                    logoOptions.length === 0 &&
                    newMerchantName && (
                      <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
                        No logos found. Click "Search Logos" to fetch options.
                      </div>
                    )}

                  {/* Selected Logo Preview */}
                  {newMerchantLogo && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Selected:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <img
                          src={newMerchantLogo}
                          alt="Selected merchant logo"
                          className="max-w-full max-h-16 w-auto h-auto object-contain"
                          style={{ imageRendering: "auto" }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseAddMerchantModal}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMerchant}
                    disabled={
                      !newMerchantName || isFetchingLogos
                    }
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Merchant
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
                        setTaxNameOverflow(false); setTaxNumberOverflow(false);
                        setError(null);
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
                    {error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
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
                        onChange={e => {
                          const val = e.target.value;
                          if (val.length > TAX_NAME_MAX) {
                            setTaxNameOverflow(true);
                            return;
                          }
                          setTaxNameOverflow(false);
                          setNewTaxName(val);
                        }}
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
                        Tax Number
                      </label>
                      <input
                        type="text"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          taxNumberError ? "border-red-400 bg-red-50" : "border-gray-200"
                        }`}
                        value={newTaxNumber}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.length > TAX_NUMBER_MAX) {
                            setTaxNumberOverflow(true);
                            return;
                          }
                          setTaxNumberOverflow(false);
                          setNewTaxNumber(val);
                        }}
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
                          setTaxNameOverflow(false); setTaxNumberOverflow(false);
                          setTaxRateFocused(false);
                          setError(null);
                        }}
                        disabled={isSavingTax}
                        className="px-5 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={editingTaxId ? handleUpdateTax : handleAddTaxType}
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
                        const isDefault = defaultTaxIds?.includes(tax.id);
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
                                onClick={() => handleDeleteTax(tax.id || 0)}
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

      {/* Payment Method Edit Confirmation Dialog */}
      <AnimatePresence>
        {showPayEditConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isPayMethodSaving) { setShowPayEditConfirm(false); setPendingPayEditFn(null); setPayConfirmMessage(""); } }}
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
                  When editing an Payment Method all<br />
                  receipts associated with that Payment<br />
                  Method will also be updated.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { if (!isPayMethodSaving) { setShowPayEditConfirm(false); setPendingPayEditFn(null); setPayConfirmMessage(""); } }}
                    disabled={isPayMethodSaving}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const run = pendingPayEditFn;
                      setShowPayEditConfirm(false);
                      setPendingPayEditFn(null);
                      setPayConfirmMessage("");
                      if (typeof run !== "function") return;
                      setIsPayMethodSaving(true);
                      try {
                        await run();
                      } catch (e) {
                        setToast?.({ isVisible: true, message: e?.message || "Update failed", type: "error" });
                      } finally {
                        setIsPayMethodSaving(false);
                      }
                    }}
                    disabled={isPayMethodSaving}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isPayMethodSaving ? "Saving…" : "Okay"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Method Delete Confirmation Dialog */}
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
                  onClick={() => { setShowPayDeleteConfirm(false); setPendingPayDeleteMethod(null); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={doConfirmPayDeleteInDropdown}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Confirmation Dialog */}
      <AnimatePresence>
        {showDuplicateConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isDuplicateSaving) setShowDuplicateConfirm(false); }}
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
                <p className="text-sm text-gray-600 mb-6">
                  The original receipt and its related information will now be saved in the Receipts screen. The next screen will display your duplicate receipt, which you can edit and save.
                </p>

                {/* Loading bar shown while saving */}
                {isDuplicateSaving && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-2">
                      <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Saving original receipt…
                    </div>
                    <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateConfirm(false)}
                    disabled={isDuplicateSaving}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicateConfirm}
                    disabled={isDuplicateSaving}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isDuplicateSaving && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {isDuplicateSaving ? "Saving…" : "OK"}
                  </button>
                </div>
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
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
                        setError("Please enter Expense Category");
                        return;
                      }
                      if (expenseCategoryExists(nextCategory)) {
                        setError("Expense Category already exists");
                        return;
                      }
                      // Immediate local state so the dropdown shows it right away
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
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!newCategoryName.trim()}
                    onClick={async () => {
                      const nextCategory = newCategoryName.trim();
                      if (!nextCategory) {
                        setError("Please enter Expense Category");
                        return;
                      }
                      if (expenseCategoryExists(nextCategory)) {
                        setError("Expense Category already exists");
                        return;
                      }
                      // Immediate local state so the dropdown shows it right away
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
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  placeholder="Enter category name"
                  autoFocus
                  disabled={isSavingEditCategory}
                  onKeyDown={(e) => { if (e.key === "Enter" && editCategoryName.trim()) handleSaveEditCategory(); }}
                />
                {editCategoryError && (
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
                    disabled={!editCategoryName.trim() || isSavingEditCategory}
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
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
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

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />

      {/* Receipt Annotator overlay */}
      {annotatorUrl && (
        <ReceiptAnnotator
          imageUrl={annotatorUrl}
          onSave={handleAnnotationSave}
          onClose={() => {
            setAnnotatorUrl(null);
            setAnnotatorIndex(null);
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

      {/* Merchant Edit Confirmation Popup */}
      {showMerchantEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              When editing a Merchant<br />
              all receipts associated with that<br />
              Merchant will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => setShowMerchantEditConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantEdit} disabled={isSavingEditMerchant}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Merchant Delete Confirmation Popup */}
      {showMerchantDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
                onClick={() => { setShowMerchantDeleteConfirm(false); setPendingMerchantDeleteData(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantDelete} disabled={isSavingEditMerchant}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Custom alert (replaces browser alert()) */}
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

      {/* Max default tax types popup */}
      {showMaxDefaultTaxModal && (
        <SimpleAlertModal
          title="Message"
          message={"A maximum of two tax types can be selected as Default. Please unselect a tax type before selecting another."}
          onClose={() => setShowMaxDefaultTaxModal(false)}
        />
      )}

    </AnimatePresence>
  );
};

export default AddReceiptModal;
