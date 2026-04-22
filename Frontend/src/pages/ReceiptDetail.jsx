import React, { useState, useEffect, useRef } from "react";
import { NODE_API_URL } from "../api/Axios";
import { formatTaxRate } from "../utils/receiptFormatters";
import {X,ChevronLeft,ChevronRight, Trash2, ChevronDown, Plus, Pencil, MoreHorizontal, Camera, PenLine,} from "lucide-react";
import ReceiptAnnotator from "../components/receipts/ReceiptAnnotator";
import DeleteConfirmationDialog from "../components/receipts/DeleteConfirmationDialog";
import "../App.css";
import Visa from "../assets/payment/Visa.png";
import MasterCard from "../assets/payment/MasterCard.png";
import PayPal from "../assets/payment/PayPal.png";
import AmericanExpress from "../assets/payment/AmericanExpress.webp";
import Discover from "../assets/payment/discover.png";
import DinersClub from "../assets/payment/DinersClub.png";
import Cash from "../assets/payment/Cash.jpg";
import DebitCard from "../assets/payment/DebitCard.webp";
import Creditdebitcardicon from "../assets/payment/Creditdebitcardicon.jpg";
import { motion, AnimatePresence } from "framer-motion";
import shareIcon from "../assets/icons/Share_Blue.png";
import ShareOptions from "../components/ShareOptions";
import ViewReport from "../components/ViewReport";
import Toast from "../components/Toast";
import { useData } from "../context/DataContext";
import { useCurrency } from "../context/CurrencyContext";
import MerchantAvatar from "../components/MerchantAvatar";
import { usePaymentDisplay } from "../hooks/usePaymentDisplay";

// Default expense categories
const defaultExpenseCategories = [
  "Restaurants",
  "Fuel",
  "General Retail",
  "Groceries",
  "Travel",
  "Entertainment",
  "Utilities",
  "Healthcare",
  "Education",
  "Office Supplies",
  "Transportation",
  "Insurance",
  "Subscriptions",
  "Personal Care",
  "Home Improvement",
  "Clothing",
  "Electronics",
  "Gifts",
  "Donations",
  "Professional Services",
  "Other",
];

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

// Helper function to validate expense category
const isValidExpenseCategory = (category) => {
  if (!category) return false;
  const val = category.toString().trim();
  if (/^\d+$/.test(val)) return false;
  if (val.length < 2) return false;
  if (/^[\d\W]+$/.test(val)) return false;
  if (/^\d+[a-zA-Z]?(-\d+)?$/.test(val)) return false;
  return true;
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

const ReceiptDetail = ({
  receipt,
  onClose,
  onSaved,
  receiptList,
  setSelectedIndex,
  onDeleteReceipt,
}) => {
  const [selectedReceipt, setSelectedReceipt] = useState(receipt || null);
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
  const containerRef = useRef(null);
  const dropdownRef = useRef();
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfKey, setPdfKey] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [quickbooksConnected, setQuickbooksConnected] = useState(false);
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
  const [newPaymentCardType, setNewPaymentCardType] = useState("");
  const [newCardIssuerName, setNewCardIssuerName] = useState("");
  const [newLast4Digits, setNewLast4Digits] = useState("");
  const [newPaymentCategoryType, setNewPaymentCategoryType] = useState("");
  const [localPaymentMethods, setLocalPaymentMethods] = useState([]);

  // Add Merchant modal state
  const [showAddMerchantModal, setShowAddMerchantModal] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState("");
  const [newMerchantLogo, setNewMerchantLogo] = useState("");
  const [isSavingMerchant, setIsSavingMerchant] = useState(false);
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

  // Edit/Delete Expense Category state
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isSavingEditCategory, setIsSavingEditCategory] = useState(false);
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
  const [taxRefreshKey, setTaxRefreshKey] = useState(0);
  const [taxError, setTaxError] = useState(null);
  const [localTaxTypes, setLocalTaxTypes] = useState([]);
  const [showAddTaxForm, setShowAddTaxForm] = useState(false);
  const [taxRateFocused, setTaxRateFocused] = useState(false);
  const [showTaxRateChangeWarning, setShowTaxRateChangeWarning] = useState(false);
  const [pendingTaxUpdate, setPendingTaxUpdate] = useState(null);
  const [showDeleteTaxConfirm, setShowDeleteTaxConfirm] = useState(false);
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

  // Refs for dropdowns
  const merchantInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const paymentInputRef = useRef(null);
  const optionsMenuRef = useRef(null);
  const addPhotoInputRef = useRef(null);
  // Track which receipt ID has been initialized so taxData changes don't reset editedReceipt
  const lastInitReceiptIdRef = useRef(null);

  // ── Add Photo / Annotation state ──────────────────────────────────────────
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [additionalPhotoUrls, setAdditionalPhotoUrls] = useState([]);
  const [annotatorUrl, setAnnotatorUrl] = useState(null);
  const [annotatorSource, setAnnotatorSource] = useState(null); // { type: 'existing'|'additional', index: number }

  // Editable tags state
  const [editedTags, setEditedTags] = useState({
    locked: false,
    starred: false,
    flagged: false,
    verified: false,
    reconciled: false,
    reimbursed: false,
    warrantied: false,
  });

  const {
    receipts,
    updateReceiptStatus,
    updateReceipt,
    deleteReceipt,
    expenseCategories,
    paymentMethods,
    merchantsWithImages,
    receiptTaxValues,
    taxData,
    refreshData,
    silentRefreshData,
    addTax,
    updateTax,
    deleteTax,
    fetchTaxes,
    addExpenseCategory,
  } = useData();
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

  // Get merchant image by name
  const getMerchantImage = (name) => {
    if (!name) return null;
    const merchant = allMerchantsWithImages.find(
      (m) => m.name?.toLowerCase() === name?.toLowerCase()
    );
    return merchant?.image || null;
  };

  // Get all expense categories - filtered
  const allExpenseCategories = React.useMemo(() => {
    const validExisting = (expenseCategories || []).filter(
      isValidExpenseCategory
    );
    return [...new Set([...defaultExpenseCategories, ...validExisting])].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [expenseCategories]);

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

    // PRIORITY 1: Always use card_issuer_name if available
    if (issuer && issuer !== "0") {
      // Strip any accidentally embedded *digits from issuer before displaying
      const cleanIssuer = issuer.replace(/\s*\*\d{3,4}/g, "").trim();
      const alreadyHasLast4 = last4 && issuer.includes(`*${last4}`);
      if (alreadyHasLast4) return issuer; // issuer already has *last4 embedded, use as-is
      return `${cleanIssuer}${last4 ? ` *${last4}` : ""}`;
    }

    // PRIORITY 2: Use paymentType if no issuer
    if (type) {
      // Clean up type - remove invalid *0 parts
      const cleanType = type.replace(/\*\s*0$/, "").trim();
      if (cleanType && cleanType !== "0") {
        return last4 ? `${cleanType} *${last4}` : cleanType;
      }
      if (last4) return `*${last4}`;
    }

    return "";
  }, []);

  // Get all payment methods - use actual user payment methods from receipts
  // (like "Bank of America *1111", "Visa *0177", etc.)
  const allPaymentMethods = React.useMemo(() => {
    const validExisting = (paymentMethods || []).filter((p) => {
      if (!p) return false;
      const val = p.toString().trim();
      if (val === "0" || val === "0*0" || /^0\*\d*$/.test(val)) return false;
      if (val.length < 2) return false;
      // Filter out "Cash *0", "Cash*0" variations - keep only "Cash"
      if (/^cash\s*\*\s*0$/i.test(val)) return false;
      // Filter out any payment ending with *0 (invalid card number)
      if (/\*\s*0$/.test(val)) return false;
      return true;
    });
    // Sort alphabetically - same as mobile app
    return [...new Set(validExisting)]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [paymentMethods]);

  // Get all tax types - merge taxData (API definitions) with receiptTaxValues, exclude Tip
  const allTaxTypes = React.useMemo(() => {
  const taxMap = new Map();

  // Priority 1: Add taxes from taxData API (saved tax type definitions)
  if (Array.isArray(taxData)) {
    taxData.forEach((tax) => {
      const name = (tax.tax_name || "").toString().trim();
      const rate = (tax.tax_rate || "").toString().trim();
      if (name && rate && !name.toLowerCase().includes("tip")) {
        const key = `${name}|${rate}`;
        if (!taxMap.has(key)) {
          taxMap.set(key, {
            tax_name: name,
            tax_rate: rate,
            tax_number: tax.tax_number || "",
            id: tax.id || 0,
            fk_user_id: tax.fk_user_id || 0,
          });
        }
      }
    });
  }

  // Priority 2: Also include taxes from receiptTaxValues for backward compatibility
  if (Array.isArray(receiptTaxValues)) {
    receiptTaxValues.forEach((tax) => {
      const name = (tax.tax_name || "").toString().trim();
      const rate = (tax.tax_rate || "").toString().trim();
      if (name && rate && !name.toLowerCase().includes("tip")) {
        const key = `${name}|${rate}`;
        if (!taxMap.has(key)) {
          taxMap.set(key, {
            tax_name: name,
            tax_rate: rate,
            tax_number: tax.tax_number || "",
            id: tax.id || tax.fk_tax_id || 0,
            fk_user_id: tax.fk_user_id || 0,
          });
        }
      }
    });
  }

  // Also include any taxes added locally this session
  localTaxTypes.forEach((tax) => {
    const name = (tax.tax_name || "").toString().trim();
    const rate = (tax.tax_rate || "").toString().trim();
    if (name && rate && !name.toLowerCase().includes("tip")) {
      const key = `${name}|${rate}`;
      if (!taxMap.has(key)) {
        taxMap.set(key, {
          tax_name: name,
          tax_rate: rate,
          tax_number: tax.tax_number || "",
          id: tax.id || 0,
          fk_user_id: tax.fk_user_id || 0,
          is_default_tax: tax.is_default_tax || 0,
        });
      }
    }
  });

  return Array.from(taxMap.values());
}, [taxData, receiptTaxValues, taxRefreshKey, localTaxTypes]);

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

  // Initialize edited receipt when selected receipt changes
  useEffect(() => {
    if (selectedReceipt) {
      // Only re-initialize if the receipt itself changed (different ID).
      // This prevents taxData refreshes (from fetchTaxes after adding a new tax)
      // from resetting editedReceipt and wiping the newly added tax entry.
      if (lastInitReceiptIdRef.current === selectedReceipt.id) return;
      lastInitReceiptIdRef.current = selectedReceipt.id;

      // Enrich receipt_tax_values with tax_name and tax_rate from taxData
      // This handles cases where the API returns taxes without tax_name/tax_rate
      let enrichedTaxValues = (selectedReceipt.receipt_tax_values || []).map(
        (tax) => {
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
            parseFloat(selectedReceipt.subtotal) ||
            parseFloat(selectedReceipt.purchasePrice) ||
            0;
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
        }
      );

      // Extract tip from receipt_tax_values
      const tipEntry = enrichedTaxValues.find((t) =>
        (t.tax_name || "").toLowerCase().includes("tip")
      );
      const nonTipTaxValues = enrichedTaxValues
        .filter((t) => !(t.tax_name || "").toLowerCase().includes("tip"))
        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""));

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
        // Return the base type with *last4 appended for display (if last4 is available and valid)
        if (last4 && last4 !== "0") {
          return `${baseType} *${last4}`;
        }
        return baseType;
      })();

      setEditedReceipt({
        receipt_category: selectedReceipt.receipt_category,
        product_date: selectedReceipt.product_date,
        storeName: selectedReceipt.storeName || "",
        expense_type: selectedReceipt.expense_type || "",
        paymentType: cleanPaymentType,
        paymentBrand: "", // Always clear so r.paymentBrand doesn't leak into logo detection
        card_issuer_name: selectedReceipt.card_issuer_name || "",
        subtotal:
          selectedReceipt.subtotal || selectedReceipt.purchasePrice || 0,
        purchasePrice: selectedReceipt.purchasePrice || 0,
        product_name: selectedReceipt.product_name || "",
        notes: selectedReceipt.notes || "",
        receipt_tax_values: nonTipTaxValues,
        tip: tipEntry ? (tipEntry.tax_amount ?? "") : "",
        store_image: selectedReceipt.store_image || "",
      });
      // Show TIP field if receipt already has a tip value
      setTipVisible(!!tipEntry && parseFloat(tipEntry.tax_amount) > 0);

      // Initialize tags from receipt_tag
      const tags = parseReceiptTags(selectedReceipt.receipt_tag);
      if (tags) {
        setEditedTags({
          locked: tags.locked || false,
          starred: tags.starred || false,
          flagged: tags.flagged || false,
          verified: tags.verified || false,
          reconciled: tags.reconciled || false,
          reimbursed: tags.reimbursed || false,
          warrantied: tags.warrantied || false,
        });
      }
    }
  }, [selectedReceipt, taxData]);

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

  // Toggle tag
  const toggleTag = (tagName) => {
    setEditedTags((prev) => ({
      ...prev,
      [tagName]: !prev[tagName],
    }));
  };

  useEffect(() => {
    const receiptsToUse =
      receiptList && receiptList.length > 0 ? receiptList : receipts;

    if (receiptsToUse && receiptsToUse.length > 0) {
      const sorted = [...receiptsToUse].sort(
        (a, b) => new Date(b.product_date) - new Date(a.product_date)
      );
      setSortedReceipts(sorted);
      const initialIndex = sorted.findIndex((r) => r.id === receipt?.id);
      if (initialIndex !== -1) {
        setSelectedReceipt(sorted[initialIndex]);
        if (setSelectedIndex) {
          setSelectedIndex(initialIndex);
        }
      }
    }
  }, [receipts, receipt, receiptList, setSelectedIndex]);

  if (!selectedReceipt) return null;

  const currentIndex = sortedReceipts.findIndex(
    (r) => r.id === selectedReceipt.id
  );

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setSelectedReceipt(sortedReceipts[currentIndex - 1]);
    }
  };

  const goToNext = () => {
    if (currentIndex < sortedReceipts.length - 1) {
      setDirection(1);
      setSelectedReceipt(sortedReceipts[currentIndex + 1]);
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
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }

    setStartX(null);
    setIsSwiping(false);
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
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

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

  // Helper function to calculate subtotal from total, taxes, and tip
  const calculateSubtotal = (total, taxValues, tip) => {
    const totalNum = parseFloat(total) || 0;
    const tipNum = parseFloat(tip) || 0;
    const totalTaxes = (taxValues || []).reduce((sum, t) => {
      return sum + (parseFloat(t.tax_amount) || 0);
    }, 0);
    const subtotal = totalNum - totalTaxes - tipNum;
    return subtotal > 0 ? subtotal : 0;
  };

  // Handle field changes in edit mode
  const handleFieldChange = (field, value) => {
    if (editedTags.locked) return; // Receipt is locked — prevent any changes
    setEditedReceipt((prev) => {
      const newData = { ...prev, [field]: value };

      // When total changes, recalculate subtotal
      if (field === "purchasePrice") {
        const total = parseFloat(value) || 0;
        const tipAmount = parseFloat(newData.tip) || 0;
        const taxValues = newData.receipt_tax_values || [];
        newData.subtotal = calculateSubtotal(total, taxValues, tipAmount);
      }

      // When tip changes, recalculate subtotal
      if (field === "tip") {
        const total =
          parseFloat(newData.purchasePrice) ||
          parseFloat(r.total) ||
          parseFloat(r.purchasePrice) ||
          0;
        const tipAmount = parseFloat(value) || 0;
        const taxValues = newData.receipt_tax_values || [];
        newData.subtotal = calculateSubtotal(total, taxValues, tipAmount);
      }

      return newData;
    });
  };

  // Payment card types for Add Payment Method modal
  const paymentCardTypes = [
    { name: "Visa", logo: Visa },
    { name: "Mastercard", logo: MasterCard },
    { name: "American Express", logo: AmericanExpress },
    { name: "Discover", logo: Discover },
    { name: "Diners Club", logo: DinersClub },
    { name: "PayPal", logo: PayPal },
    { name: "Debit Card", logo: DebitCard },
    { name: "Other", logo: Creditdebitcardicon },
  ];

  const handleOpenAddPaymentModal = () => {
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setShowAddPaymentModal(true);
    setShowPaymentDropdown(false);
  };

  const handleCloseAddPaymentModal = () => {
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setShowAddPaymentModal(false);
  };

  const handleAddPaymentMethod = () => {
    if (!newPaymentCardType || newPaymentCardType.trim().length === 0) return;
    if (!newLast4Digits || newLast4Digits.trim().replace(/\D/g, "").length < 4) {
      alert("Please enter the last 4 digits of the card.");
      return;
    }

    // Determine selected card type for logo detection
    const cardTypeLower = newPaymentCardType.trim().toLowerCase();
    let selectedCardTypeForLogo = newPaymentCardType.trim();
    if (cardTypeLower.includes("visa")) selectedCardTypeForLogo = "Visa";
    else if (cardTypeLower.includes("master"))
      selectedCardTypeForLogo = "MasterCard";
    else if (
      cardTypeLower.includes("american express") ||
      cardTypeLower.includes("amex")
    )
      selectedCardTypeForLogo = "American Express";
    else if (cardTypeLower.includes("discover"))
      selectedCardTypeForLogo = "Discover";
    else if (cardTypeLower.includes("diners"))
      selectedCardTypeForLogo = "Diners Club";
    else if (cardTypeLower.includes("paypal"))
      selectedCardTypeForLogo = "PayPal";
    else if (cardTypeLower.includes("debit"))
      selectedCardTypeForLogo = "Debit Card";
    else if (cardTypeLower === "other") selectedCardTypeForLogo = "Other";

    let finalCardIssuerName =
      newCardIssuerName.trim() || selectedCardTypeForLogo;
    const last4 = newLast4Digits.trim().replace(/\D/g, "").slice(0, 4);

    // Update form fields
    handleFieldChange("paymentType", selectedCardTypeForLogo);
    // Clear paymentBrand so original receipt's brand doesn't override logo detection
    handleFieldChange("paymentBrand", "");
    handleFieldChange("card_issuer_name", finalCardIssuerName);
    if (last4.length > 0) {
      handleFieldChange("last_4_digit_card", last4);
    } else {
      handleFieldChange("last_4_digit_card", "");
    }

    handleCloseAddPaymentModal();
  };

  // ============ Tax Management Functions ============

  // Add a tax type to the current receipt's tax values
  const addTaxToReceipt = (tax) => {
    setEditedReceipt((prev) => {
      const currentTaxValues =
        prev.receipt_tax_values ||
        enrichedReceiptTaxValues.filter(
          (t) => !(t.tax_name || "").toLowerCase().includes("tip")
        ) ||
        [];

      // Check for duplicates
      const alreadyExists = currentTaxValues.some(
        (t) => t.tax_name === tax.tax_name && t.tax_rate === tax.tax_rate
      );
      if (alreadyExists) return prev;

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
      const newTaxEntry = {
        id: 0,
        fk_user_id: fk_user_id,
        fk_receipt_id: selectedReceipt?.id || 0,
        fk_tax_id: tax.id || 0,
        tax_name: tax.tax_name,
        tax_rate: tax.tax_rate,
        tax_amount: 0,
        tax_number: tax.tax_number || "",
        created: 0,
        updated: 0,
      };
      // Sort alphabetically so tax fields always render in A→Z order
      const newTaxValues = [...currentTaxValues, newTaxEntry]
        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""));

      // Recalculate subtotal from total using combined tax rates
      const totalTaxRate = newTaxValues.reduce(
        (sum, t) => sum + (parseFloat(t.tax_rate) || 0),
        0
      );
      const newSubtotal =
        totalTaxRate > 0
          ? (total - tipAmount) / (1 + totalTaxRate / 100)
          : total - tipAmount;

      // Recalculate each tax amount based on new subtotal
      const updatedTaxValues = newTaxValues.map((t) => ({
        ...t,
        tax_amount: parseFloat(
          ((newSubtotal * (parseFloat(t.tax_rate) || 0)) / 100).toFixed(2)
        ),
      }));

      return {
        ...prev,
        receipt_tax_values: updatedTaxValues,
        subtotal: parseFloat(newSubtotal.toFixed(2)),
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

      // Recalculate subtotal
      const totalTaxRate = newTaxValues.reduce(
        (sum, t) => sum + (parseFloat(t.tax_rate) || 0),
        0
      );
      const newSubtotal =
        totalTaxRate > 0
          ? (total - tipAmount) / (1 + totalTaxRate / 100)
          : total - tipAmount;

      // Recalculate each tax amount
      const updatedTaxValues = newTaxValues.map((t) => ({
        ...t,
        tax_amount: parseFloat(
          ((newSubtotal * (parseFloat(t.tax_rate) || 0)) / 100).toFixed(2)
        ),
      }));

      return {
        ...prev,
        receipt_tax_values: updatedTaxValues,
        subtotal: parseFloat(newSubtotal.toFixed(2)),
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

  const taxNameError = newTaxName.length > TAX_NAME_MAX
    ? `Tax Name cannot exceed ${TAX_NAME_MAX} characters (${newTaxName.length}/${TAX_NAME_MAX})`
    : (newTaxName.trim() && isDuplicateTaxName(newTaxName.trim(), editingTaxId || null)
      ? `"${newTaxName.trim()}" already exists. Please use a different name.`
      : "");

  const taxRateError = newTaxRate !== "" && parseFloat(newTaxRate) > TAX_RATE_MAX
    ? `Tax Rate cannot exceed ${TAX_RATE_MAX}%`
    : (newTaxRate !== "" && hasMoreThan3Decimals(newTaxRate)
      ? "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)"
      : "");

  const taxNumberError = newTaxNumber.length > TAX_NUMBER_MAX
    ? `Tax Number cannot exceed ${TAX_NUMBER_MAX} characters (${newTaxNumber.length}/${TAX_NUMBER_MAX})`
    : null;

  // Manage Tax Types modal handlers
  const handleAddTaxType = async () => {
    if (!newTaxName.trim() || !newTaxRate.trim()) {
      setTaxError("Tax Name and Tax Rate are required.");
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim())) {
      setTaxError(`"${newTaxName.trim()}" already exists. Please use a different name.`);
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setTaxError("Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%).");
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
      const savedTax = await addTax(taxPayload);
      if (savedTax) {
        // Add to receipt FIRST — must happen before any fetchTaxes/taxData update
        // (the ref guard in the init useEffect prevents taxData changes from
        //  resetting editedReceipt, but calling addTaxToReceipt first is safer)
        addTaxToReceipt({
          id: savedTax.id || 0,
          tax_name: newTaxName.trim(),
          tax_rate: newTaxRate.trim(),
          tax_number: newTaxNumber.trim() || "",
        });
        // Add to local session list so dropdown shows the new tax immediately
        setLocalTaxTypes((prev) => [...prev, { ...taxPayload, id: savedTax.id || Date.now() }]);
        setTaxRefreshKey((prev) => prev + 1);
        // fetchTaxes is called automatically by the modal-close useEffect
      }
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setShowManageTaxModal(false);
    } catch (err) {
      console.error("Error adding tax:", err);
      setTaxError(err.message || "Failed to add tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleUpdateTaxType = async () => {
    if (!editingTaxId || !newTaxName.trim() || !newTaxRate.trim()) {
      setTaxError("Tax Name and Tax Rate are required.");
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim(), editingTaxId)) {
      setTaxError(`"${newTaxName.trim()}" already exists. Use a different name.`);
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setTaxError("Tax Rate can have a maximum of 3 decimal places.");
      return;
    }
    const cleanRate = String(newTaxRate).replace(/%/g, "").trim();
    const allKnown = [...(taxData || []), ...localTaxTypes];
    const existingTaxForRateCheck = allKnown.find((t) => t.id === editingTaxId);
    if (existingTaxForRateCheck && parseFloat(existingTaxForRateCheck.tax_rate) !== parseFloat(cleanRate)) {
      setPendingTaxUpdate({ newName: newTaxName.trim(), newRate: cleanRate, newNumber: newTaxNumber.trim() });
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
        is_default_tax: existingTax?.is_default_tax || 0,
        is_tips: existingTax?.is_tips || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: Date.now(),
      };
      await updateTax(taxPayload);
      await fetchTaxes();
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setEditingTaxId(null);
      setShowAddTaxForm(false);
    } catch (err) {
      console.error("Error updating tax:", err);
      setTaxError(err.message || "Failed to update tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const confirmTaxRateChange = async () => {
    setShowTaxRateChangeWarning(false);
    if (!pendingTaxUpdate) return;
    const { newName, newRate, newNumber } = pendingTaxUpdate;
    setPendingTaxUpdate(null);
    setIsSavingTax(true);
    setTaxError(null);
    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || "0";
      const allKnown = [...(taxData || []), ...localTaxTypes];
      const existingTax = allKnown.find(t => t.id === editingTaxId);
      await updateTax({
        id: editingTaxId,
        fk_user_id: parseInt(fk_user_id),
        tax_name: newName,
        tax_rate: newRate,
        tax_number: newNumber || "",
        is_default_tax: existingTax?.is_default_tax || 0,
        is_tips: existingTax?.is_tips || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: Date.now(),
      });
      await fetchTaxes();
      setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber(""); setEditingTaxId(null);
      setShowAddTaxForm(false); setTaxError(null);
    } catch (err) {
      setTaxError(err.message || "Failed to update tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleDeleteTaxType = async (taxId) => {
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
    setNewTaxRate(tax.tax_rate || "");
    setNewTaxNumber(tax.tax_number || "");
    setShowAddTaxForm(true);
    setTaxError(null);
  };

  const handleCancelEditTax = () => {
    setEditingTaxId(null);
    setNewTaxName("");
    setNewTaxRate("");
    setNewTaxNumber("");
  };

  const closeTaxModal = () => {
    setShowManageTaxModal(false);
    setShowAddTaxForm(false);
    setTaxRateFocused(false);
    setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber("");
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
    setShowAddMerchantModal(true);
    setShowMerchantDropdown(false);
  };

  const handleCloseAddMerchantModal = () => {
    setNewMerchantName("");
    setNewMerchantLogo("");
    setLogoOptions([]);
    setSelectedLogoIndex(null);
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

  const handleAddMerchant = () => {
    if (!newMerchantName || newMerchantName.trim().length === 0) return;
    // Add merchant to local list only — the logo will be persisted when the
    // receipt is saved. No separate DB receipt should be created here as that
    // causes a blank duplicate receipt in the database.
    const newMerchant = { name: newMerchantName.trim(), image: newMerchantLogo.trim() };
    setLocalMerchants((prev) => [...prev, newMerchant]);
    handleFieldChange("storeName", newMerchant.name);
    handleFieldChange("store_image", newMerchant.image || "");
    handleCloseAddMerchantModal();
    setToast({ isVisible: true, message: "Merchant added successfully!", type: "success" });
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

  /** Rename + update logo for ALL receipts using this merchant, then refresh. */
  const handleSaveEditMerchant = async () => {
    if (!editMerchantName.trim()) {
      setEditMerchantError("Merchant name is required.");
      return;
    }
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
      // Update the currently viewed receipt's store fields if affected
      if ((editedReceipt.storeName || "").toLowerCase() === oldName.toLowerCase()) {
        handleFieldChange("storeName", newName);
        handleFieldChange("store_image", newLogo);
      }
      setShowEditMerchantModal(false);
      setEditingMerchant(null);
      await refreshData();
      setToast({ isVisible: true, message: "Merchant updated successfully!", type: "success" });
    } catch (err) {
      setEditMerchantError(err.message || "Failed to update merchant.");
    } finally {
      setIsSavingEditMerchant(false);
    }
  };

  /** Move all receipts of this merchant to "Miscellaneous". */
  const handleDeleteMerchant = async (merchant) => {
    if (merchant.name.toLowerCase() === "miscellaneous") return;
    if (!window.confirm(`Delete "${merchant.name}"?\n\nAll receipts with this merchant will be changed to "Miscellaneous".`)) return;
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
      if ((editedReceipt.storeName || "").toLowerCase() === merchant.name.toLowerCase()) {
        handleFieldChange("storeName", "Miscellaneous");
        handleFieldChange("store_image", "");
      }
      await refreshData();
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
    formData.append("file", file);
    const response = await fetch("/api/user/uploadmediaV1", {
      method: "POST",
      headers: { Accesstoken: token },
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data[0]?.fullImageUrl) return data[0].fullImageUrl;
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
      setAdditionalPhotoUrls((prev) => [...prev, url]);
      // Persist to receipt immediately: fill empty slots first
      const r = selectedReceipt;
      const hasImage = r?.receipt_image && !["0", "null", ""].includes(r.receipt_image.trim());
      const hasAttachment = r?.emailAttachment && !["0", "null", ""].includes(r.emailAttachment.trim());
      const patch = hasImage
        ? hasAttachment ? {} : { emailAttachment: url }
        : { receipt_image: url };
      if (Object.keys(patch).length > 0) {
        handleFieldChange(Object.keys(patch)[0], url);
      }
    } catch (err) {
      console.error("Add photo failed:", err);
    } finally {
      setIsAddingPhoto(false);
    }
  };

  const handleAnnotationSaveDetail = (dataUrl) => {
    if (annotatorSource?.type === "additional") {
      setAdditionalPhotoUrls((prev) =>
        prev.map((u, i) => (i === annotatorSource.index ? dataUrl : u))
      );
    } else if (annotatorSource?.type === "existing") {
      // Replace via editedReceipt fields
      const idx = annotatorSource.index;
      const r = selectedReceipt;
      const existingUrls = [r?.emailAttachment, r?.receipt_image].filter(
        (u) => u && typeof u === "string" && !["0", "null", ""].includes(u.trim())
      );
      if (existingUrls[idx] === r?.emailAttachment) {
        handleFieldChange("emailAttachment", dataUrl);
      } else {
        handleFieldChange("receipt_image", dataUrl);
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
    setShowEditCategoryModal(true);
    setShowCategoryDropdown(false);
  };

  const handleSaveEditCategory = async () => {
    const newName = editCategoryName.trim();
    if (!newName) { setEditCategoryError("Category name is required."); return; }
    setIsSavingEditCategory(true);
    setEditCategoryError(null);
    const oldName = editingCategory;
    try {
      const affected = (receipts || []).filter(
        (r) => (r.expense_type || "").toLowerCase() === oldName.toLowerCase()
      );
      for (const r of affected) {
        await putUpdateReceipt({ ...r, expense_type: newName });
      }
      addExpenseCategory(newName);
      if ((editedReceipt.expense_type || "").toLowerCase() === oldName.toLowerCase()) {
        handleFieldChange("expense_type", newName);
      }
      setShowEditCategoryModal(false);
      setEditingCategory(null);
      await refreshData();
      setToast({ isVisible: true, message: "Expense category updated successfully!", type: "success" });
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
      if ((editedReceipt.expense_type || "").toLowerCase() === deletingCategory.toLowerCase()) {
        handleFieldChange("expense_type", "");
      }
      setShowDeleteCategoryConfirm(false);
      setDeletingCategory(null);
      await refreshData();
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

  /** Update a field on a specific split, auto-calculating tax/total like the main form */
  const updateSplitField = (idx, field, value) => {
    const mainSubtotal = parseFloat(editedReceipt.subtotal) || parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.subtotal) || 0;
    const mainTotal    = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;

    if (field === "subtotal" && mainSubtotal > 0 && (parseFloat(value) || 0) > mainSubtotal) {
      alert(`Subtotal cannot exceed $${mainSubtotal.toFixed(2)}`);
      return;
    }
    if (field === "purchasePrice" && mainTotal > 0 && (parseFloat(value) || 0) > mainTotal) {
      alert(`Total cannot exceed $${mainTotal.toFixed(2)}`);
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
      const last4      = selectedReceipt?.last_4_digit_card?.toString?.().trim() || "";
      let productDate  = 0;
      const dateVal    = editedReceipt.product_date || selectedReceipt?.product_date;
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) productDate = Math.floor(d.getTime() / 1000);
      }
      if (!productDate) productDate = Math.floor(Date.now() / 1000);
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
          card_issuer_name: selectedReceipt?.card_issuer_name || "",
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

      // Build receipt_tax_values including tip
      const tipAmount = parseFloat(editedReceipt.tip) || 0;
      const subtotal = parseFloat(editedReceipt.subtotal) || 0;
      const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
      // Ensure each tax entry has all required API fields
      let receiptTaxValuesPayload = (
        editedReceipt.receipt_tax_values || []
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

      if (tipAmount > 0) {
        const tipPercentage =
          subtotal > 0 ? Math.round((tipAmount / subtotal) * 100) : 0;
        receiptTaxValuesPayload.push({
          id: 0,
          fk_user_id: 0,
          fk_receipt_id: selectedReceipt.id,
          fk_tax_id: 0,
          tax_name: "Tip",
          tax_rate: tipPercentage.toString(),
          tax_amount: tipAmount.toString(),
          created: 0,
          updated: 0,
        });
      }

      // Get store_image from selected merchant if changed
      const selectedMerchantImage = getMerchantImage(editedReceipt.storeName);
      const storeImageToSave =
        selectedMerchantImage ||
        editedReceipt.store_image ||
        selectedReceipt.store_image ||
        "";

      // Determine card_issuer_name and last4 from payment type
      let last4 = selectedReceipt.last_4_digit_card?.toString?.().trim() || "";
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

      // Merge edited data with original receipt fields to ensure all fields are included
      const updatedData = {
        ...selectedReceipt, // Include all original fields
        ...editedReceipt, // Override with edited fields
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
        alert("Failed to delete receipt. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting receipt:", error);
      alert("Error deleting receipt. Please try again.");
    } finally {
      setIsDeleting(false);
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

  // Enrich receipt_tax_values with tax_name and tax_rate from taxData for display
  const enrichedReceiptTaxValues = React.useMemo(() => {
    if (
      !Array.isArray(r.receipt_tax_values) ||
      r.receipt_tax_values.length === 0
    ) {
      return [];
    }

    return r.receipt_tax_values.map((tax) => {
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
        parseFloat(r.subtotal) || parseFloat(r.purchasePrice) || 0;
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
  }, [r.receipt_tax_values, r.subtotal, r.purchasePrice, taxData]);

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

    // Build receipt_tax_values including tip
    const tipAmount = parseFloat(editedReceipt.tip) || 0;
    const subtotal = parseFloat(editedReceipt.subtotal) || 0;
    let receiptTaxValuesPayload = [...(editedReceipt.receipt_tax_values || [])];

    if (tipAmount > 0) {
      const tipPercentage =
        subtotal > 0 ? Math.round((tipAmount / subtotal) * 100) : 0;
      receiptTaxValuesPayload.push({
        id: 0,
        fk_user_id: 0,
        fk_receipt_id: selectedReceipt.id,
        fk_tax_id: 0,
        tax_name: "Tip",
        tax_rate: tipPercentage.toString(),
        tax_amount: tipAmount.toString(),
        created: 0,
        updated: 0,
      });
    }

    // Get store_image from selected merchant if changed
    const selectedMerchantImage = getMerchantImage(editedReceipt.storeName);
    const storeImageToSave =
      selectedMerchantImage ||
      editedReceipt.store_image ||
      selectedReceipt.store_image ||
      "";

    // Determine card_issuer_name and last4 from payment type
    let last4 = selectedReceipt.last_4_digit_card?.toString?.().trim() || "";
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

    // Merge edited data with original receipt fields
    const updatedData = {
      ...selectedReceipt,
      ...editedReceipt,
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

      const formatDate = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      };

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
                      const url = receipt?.emailAttachment;
                      if (!url || typeof url !== "string") return "";
                      const trimmed = url.trim();
                      if (
                        !trimmed ||
                        ["0", "null", "@", "undefined", ""].includes(trimmed)
                      )
                        return "";
                      const invalidPatterns = [
                        "android.resource://",
                        "content://",
                        "file://",
                        "resource://",
                      ];
                      if (invalidPatterns.some((p) => trimmed.startsWith(p)))
                        return "";
                      return trimmed;
                    };

                    const getPdfUrl = (url) => {
                      if (
                        url.startsWith("data:") ||
                        url.startsWith("https://") ||
                        url.includes("pdf_proxy_base.php")
                      ) {
                        return url;
                      }
                      const proxy =
                        "https://categorizr.com/emailserver/pdf_proxy_base.php?url=";
                      return proxy + encodeURIComponent(url);
                    };

                    const emailAttachmentUrl = getEmailAttachmentUrl();
                    const isPdfAttachment =
                      !!emailAttachmentUrl &&
                      (/\.pdf(\?|$)/i.test(emailAttachmentUrl) ||
                        emailAttachmentUrl.startsWith("data:application/pdf"));
                    const finalPdfUrl = isPdfAttachment
                      ? getPdfUrl(emailAttachmentUrl)
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
      alert("Failed to generate PDF. Please try again.");
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

      const formatDate = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      };

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
                      const url = receipt?.emailAttachment;
                      if (!url || typeof url !== "string") return "";
                      const trimmed = url.trim();
                      if (
                        !trimmed ||
                        ["0", "null", "@", "undefined", ""].includes(trimmed)
                      )
                        return "";
                      const invalidPatterns = [
                        "android.resource://",
                        "content://",
                        "file://",
                        "resource://",
                      ];
                      if (invalidPatterns.some((p) => trimmed.startsWith(p)))
                        return "";
                      return trimmed;
                    };

                    const getPdfUrl = (url) => {
                      if (
                        url.startsWith("data:") ||
                        url.startsWith("https://") ||
                        url.includes("pdf_proxy_base.php")
                      ) {
                        return url;
                      }
                      const proxy =
                        "https://categorizr.com/emailserver/pdf_proxy_base.php?url=";
                      return proxy + encodeURIComponent(url);
                    };

                    const emailAttachmentUrl = getEmailAttachmentUrl();
                    const isPdfAttachment =
                      !!emailAttachmentUrl &&
                      (/\.pdf(\?|$)/i.test(emailAttachmentUrl) ||
                        emailAttachmentUrl.startsWith("data:application/pdf"));
                    const finalPdfUrl = isPdfAttachment
                      ? getPdfUrl(emailAttachmentUrl)
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
      alert("Error generating ZIP file. Please try again.");
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
        <div
          ref={containerRef}
          className="relative w-full h-full overflow-auto p-2 sm:p-4 text-center"
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
              <div className="receipt-modal-header flex items-center border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-2.5 bg-white sticky top-0 z-20">
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
                  {/* Locked/Unlocked Status */}
                  <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1.5 sm:px-2 py-1 sm:py-1.5">
                    <img
                      src={getTagImage("locked", receiptTags?.locked || false)}
                      alt={receiptTags?.locked ? "Locked" : "Unlocked"}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain flex-shrink-0"
                    />
                    <span className="text-[8px] sm:text-[10px] font-medium text-gray-700 whitespace-nowrap">
                      {receiptTags?.locked ? "Locked" : "Unlocked"}
                    </span>
                  </div>

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
              <div className="overflow-y-auto flex-1 min-h-0">
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
                                        if (maxTax > 0 && v > maxTax) { alert(`${t.tax_name} cannot exceed $${maxTax.toFixed(2)}`); return; }
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
                              <img src={payLogo} alt="payment" className="w-8 h-5 object-contain flex-shrink-0" />
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
                                      <img src={payLogo} alt="payment" className="w-8 h-5 object-contain flex-shrink-0" />
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
                        This receipt is locked. Toggle the lock in Tags below to make changes.
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
                            value={(() => {
                              if (!editedReceipt.product_date) return "";
                              const d = new Date(Number(editedReceipt.product_date) * 1000);
                              return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
                            })()}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const [yr, mo, dy] = e.target.value.split("-").map(Number);
                              const utcMidnight = new Date(Date.UTC(yr, mo - 1, dy));
                              handleFieldChange("product_date", Math.floor(utcMidnight.getTime() / 1000));
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
                                          handleFieldChange("storeName", merchant.name);
                                          handleFieldChange("store_image", merchant.image || "");
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
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleOpenEditMerchant(merchant); }}
                                            className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                                            title="Edit merchant"
                                          >
                                            <Pencil size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteMerchant(merchant); }}
                                            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                                            title="Delete merchant"
                                          >
                                            <Trash2 size={13} />
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
                                <img
                                  src={logo}
                                  alt={
                                    receiptForLogo.paymentType ||
                                    receiptForLogo.card_issuer_name ||
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

                                // Always update card_issuer_name (including empty) so user can clear the field
                                const safeBaseName = baseName.replace(/\s*\*\d{3,4}$/, "").trim();
                                handleFieldChange("card_issuer_name", safeBaseName);

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
                                  // Logo = card type. Find a receipt with this payment display so we use its paymentType for logo
                                  const receiptsToSearch =
                                    receiptList && receiptList.length > 0
                                      ? receiptList
                                      : receipts || [];
                                  const matchingReceipt = receiptsToSearch.find(
                                    (r) => getPaymentDisplayName(r) === method
                                  );
                                  // Check Settings-saved card type map (cat_pay_card_types) for correct logo
                                  const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
                                  const logo = matchingReceipt
                                    ? getPaymentLogo(matchingReceipt)
                                    : _pct[method]
                                      ? getPaymentLogo({ paymentType: _pct[method] })
                                      : getPaymentLogo(method);
                                  return (
                                    <div
                                      key={idx}
                                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2"
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

                                        // Update card_issuer_name with issuer name (for display)
                                        if (baseMethod) {
                                          handleFieldChange(
                                            "card_issuer_name",
                                            baseMethod
                                          );
                                        }

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

                                        setShowPaymentDropdown(false);
                                      }}
                                    >
                                      {logo && (
                                        <img
                                          src={logo}
                                          alt={method}
                                          className="w-5 h-5 rounded"
                                        />
                                      )}
                                      {method}
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
                              const total =
                                parseFloat(editedReceipt.purchasePrice) ||
                                parseFloat(r.total) ||
                                parseFloat(r.purchasePrice) ||
                                0;
                              const tipAmount =
                                parseFloat(editedReceipt.tip) ||
                                (tipTax?.tax_amount
                                  ? parseFloat(tipTax.tax_amount)
                                  : 0);
                              const taxValues =
                                editedReceipt.receipt_tax_values || taxes || [];
                              const totalTaxes = taxValues.reduce(
                                (sum, t) =>
                                  sum + (parseFloat(t.tax_amount) || 0),
                                0
                              );
                              const calculatedSubtotal =
                                total - totalTaxes - tipAmount;
                              return calculatedSubtotal < 0
                                ? "text-red-500"
                                : "";
                            })()}`}
                            value={(() => {
                              const total =
                                parseFloat(editedReceipt.purchasePrice) ||
                                parseFloat(r.total) ||
                                parseFloat(r.purchasePrice) ||
                                0;
                              const tipAmount =
                                parseFloat(editedReceipt.tip) ||
                                (tipTax?.tax_amount
                                  ? parseFloat(tipTax.tax_amount)
                                  : 0);
                              const taxValues =
                                editedReceipt.receipt_tax_values || taxes || [];
                              const totalTaxes = taxValues.reduce(
                                (sum, t) =>
                                  sum + (parseFloat(t.tax_amount) || 0),
                                0
                              );
                              const calculatedSubtotal =
                                total - totalTaxes - tipAmount;
                              return `$${calculatedSubtotal > 0 ? calculatedSubtotal.toFixed(2) : "0.00"}`;
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
                                    {`${currentTaxValues[0].tax_name} (${formatTaxRate(currentTaxValues[0].tax_rate)}%)`}
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
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCurrencyInputs(p => ({ ...p, tax0: val }));
                                    const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
                                    if (!isNaN(parsed)) handleTaxChange(0, parsed);
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
                                    {`${currentTaxValues[1].tax_name} (${formatTaxRate(currentTaxValues[1].tax_rate)}%)`}
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
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCurrencyInputs(p => ({ ...p, tax1: val }));
                                    const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
                                    if (!isNaN(parsed)) handleTaxChange(1, parsed);
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
                                    <label className="font-bold">
                                      TIP ({tipPercentage}%)
                                    </label>
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
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCurrencyInputs((p) => ({ ...p, tip: val }));
                                        const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
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
                            onChange={(e) => {
                              const val = e.target.value;
                              setCurrencyInputs((p) => ({ ...p, total: val }));
                              const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
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
                              _selIdx: currentTaxVals.findIndex(
                                (t) => t.tax_name === tax.tax_name && t.tax_rate === tax.tax_rate
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
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          removeTaxFromReceipt(tax._selIdx);
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
                        className="w-full border border-blue-400 rounded-md p-2 mb-2 text-sm"
                        value={
                          editedReceipt.product_name ?? r.product_name ?? ""
                        }
                        onChange={(e) =>
                          handleFieldChange("product_name", e.target.value)
                        }
                        placeholder="No description provided"
                      />
                      <h3 className="font-semibold mb-2 text-gray-900">
                        Notes
                      </h3>
                      <textarea
                        className="w-full border border-blue-400 rounded-md p-2 mb-2 text-sm"
                        value={editedReceipt.notes ?? r.notes ?? ""}
                        onChange={(e) =>
                          handleFieldChange("notes", e.target.value)
                        }
                        placeholder="No notes provided"
                      />

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
                          const urls = [
                            ...new Set([
                              editedReceipt.emailAttachment ?? r.emailAttachment,
                              editedReceipt.receipt_image ?? r.receipt_image,
                            ]),
                          ].filter((url) => {
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
                            ];
                            return !invalidPatterns.some((p) =>
                              trimmed.startsWith(p)
                            );
                          });

                          const isPdf = (u) =>
                            typeof u === "string" &&
                            (/\.pdf(\?|$)/i.test(u) ||
                              /^data:application\/pdf/i.test(u));

                          const getPdfUrl = (url) => {
                            if (
                              url.startsWith("data:") ||
                              url.startsWith("https://") ||
                              url.includes("pdf_proxy_base.php")
                            ) {
                              return url;
                            }

                            const proxy =
                              "https://categorizr.com/emailserver/pdf_proxy_base.php?url=";
                            return proxy + encodeURIComponent(url);
                          };

                          const allUrls = [...urls, ...additionalPhotoUrls];

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
                                {isPdf(u) ? (
                                  <a
                                    href={getPdfUrl(u)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block focus:outline-none"
                                    title="Open PDF"
                                  >
                                    <div className="w-24 h-32 bg-gray-100 border rounded overflow-hidden relative">
                                      <iframe
                                        src={`${getPdfUrl(
                                          u
                                        )}#page=1&toolbar=0&navpanes=0&scrollbar=0`}
                                        className="w-full h-full border-none pointer-events-none"
                                        title="PDF Preview"
                                        loading="lazy"
                                      />
                                      <div className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-semibold bg-white/80 rounded p-0.5">
                                        PDF
                                      </div>
                                    </div>
                                  </a>
                                ) : (
                                  <img
                                    src={u}
                                    alt="Receipt"
                                    className="w-24 h-auto rounded cursor-pointer border border-gray-200"
                                    onClick={() => window.open(u, "_blank")}
                                    onError={(e) =>
                                      (e.target.style.display = "none")
                                    }
                                  />
                                )}
                                {/* Annotate button */}
                                {!isPdf(u) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAnnotatorUrl(u);
                                      setAnnotatorSource(
                                        isAdditional
                                          ? { type: "additional", index: idx - urls.length }
                                          : { type: "existing", index: idx }
                                      );
                                    }}
                                    className="absolute bottom-1 right-1 bg-white/90 hover:bg-blue-600 hover:text-white text-gray-700 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                    title="Annotate / Write on this receipt"
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
              </div>

              {/* ── Sticky Save Bar (hidden during split) ── */}
              {!showSplitScreen && (
              <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 py-3 flex flex-col gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || editedTags.locked}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  title={editedTags.locked ? "Unlock receipt to save changes" : ""}
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
        </div>
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Toast for Link to QuickBooks */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />

      {/* Add Payment Method Modal */}
      <AnimatePresence>
        {showAddPaymentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleCloseAddPaymentModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
                <h2 className="text-xl font-bold text-gray-900">
                  Add Payment Method
                </h2>
                <button
                  onClick={handleCloseAddPaymentModal}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Payment Card Type Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Payment Card Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    {paymentCardTypes.map((cardType, index) => (
                      <div
                        key={index}
                        className={`relative cursor-pointer border-2 rounded-lg transition-all flex flex-col items-center justify-center p-3 min-h-[100px] ${
                          newPaymentCardType === cardType.name
                            ? "border-blue-600 ring-2 ring-blue-300 bg-blue-50"
                            : "border-gray-200 hover:border-gray-400"
                        }`}
                        onClick={() => setNewPaymentCardType(cardType.name)}
                      >
                        <div className="flex-shrink-0 mb-2 flex items-center justify-center w-full h-12">
                          <img
                            src={cardType.logo}
                            alt={cardType.name}
                            className="max-w-full max-h-12 w-auto h-auto object-contain"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-center">
                          {cardType.name}
                        </span>
                        {newPaymentCardType === cardType.name && (
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

                {/* Card Issuer Name & Last 4 Digits */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Card Issuer <span className="font-normal text-gray-500">(optional)</span> & Last 4 Digits <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newCardIssuerName}
                      onChange={(e) => setNewCardIssuerName(e.target.value)}
                      placeholder="Enter Card Issuer (e.g., SBI)"
                    />
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newLast4Digits}
                      onChange={(e) => {
                        const value = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 4);
                        setNewLast4Digits(value);
                      }}
                      placeholder="0000"
                      maxLength={4}
                    />
                  </div>
                </div>

                {/* Payment Category Type */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Payment Category Type
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newPaymentCategoryType}
                    onChange={(e) => setNewPaymentCategoryType(e.target.value)}
                  >
                    <option value="">Select Category Type</option>
                    <option value="Personal">Personal</option>
                    <option value="Business">Business</option>
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseAddPaymentModal}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddPaymentMethod}
                    disabled={!newPaymentCardType || newLast4Digits.replace(/\D/g, "").length < 4}
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Payment Method
                  </button>
                </div>
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
                        <img src={editMerchantLogo} alt="Current logo" className="max-w-full max-h-16 w-auto h-auto object-contain" onError={(e) => { e.target.style.display = "none"; }} />
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
                            <img
                              src={logo.displayUrl}
                              alt={`Logo ${index + 1}`}
                              className="max-w-full max-h-16 w-auto h-auto object-contain"
                              onError={(e) => {
                                if (e.target.src !== logo.storeUrl) {
                                  e.target.src = logo.storeUrl;
                                } else {
                                  e.target.style.display = "none";
                                  e.target.parentElement.innerHTML = '<div class="w-full min-h-[80px] flex items-center justify-center text-xs text-gray-400">Failed to load</div>';
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

                  {/* Selected logo preview */}
                  {editMerchantLogo && editSelectedLogoIndex !== null && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Selected:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <img src={editMerchantLogo} alt="Selected logo" className="max-w-full max-h-16 w-auto h-auto object-contain" onError={(e) => { e.target.style.display = "none"; }} />
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
                            <img
                              src={logo.displayUrl}
                              alt={`Logo ${index + 1}`}
                              className="max-w-full max-h-12 w-auto h-auto object-contain"
                              onError={(e) => {
                                if (e.target.src !== logo.storeUrl) {
                                  e.target.src = logo.storeUrl;
                                } else {
                                  e.target.style.display = "none";
                                }
                              }}
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
                        <img
                          src={newMerchantLogo}
                          alt="Selected logo"
                          className="w-12 h-12 object-contain"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    </div>
                  )}
                </div>
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
                    disabled={!newMerchantName || isSavingMerchant}
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
              <div className="overflow-y-auto flex-1 px-6 py-4">

                {/* List of existing tax types — alphabetical */}
                {allTaxTypes.length > 0 ? (
                  <div className="space-y-2 mb-2">
                    {[...allTaxTypes]
                      .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""))
                      .map(tax => {
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

                {/* Add / Edit form — shown when Add tapped or Edit tapped */}
                {(showAddTaxForm || editingTaxId) && (
                  <div className={`${allTaxTypes.length > 0 ? "border-t border-gray-100 pt-5 mt-3" : "pt-2"}`}>
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
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          taxRateError ? "border-red-400 bg-red-50" : "border-gray-200"
                        }`}
                        value={taxRateFocused ? newTaxRate : (newTaxRate !== "" ? `${newTaxRate}%` : "")}
                        onFocus={() => setTaxRateFocused(true)}
                        onBlur={() => setTaxRateFocused(false)}
                        onChange={e => setNewTaxRate(e.target.value.replace(/%/g, ""))}
                        placeholder="Enter Tax Rate (%)"
                      />
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tax Rate Change Warning Dialog */}
      <AnimatePresence>
        {showTaxRateChangeWarning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">Change Tax Rate?</h3>
              <p className="text-sm text-gray-600 mb-4">
                Receipts that already use this tax type will keep their current tax amount as a fixed dollar value — the % will not auto-recalculate.
              </p>
              <p className="text-sm text-gray-600 mb-6">
                To apply the new rate to a receipt, open that receipt, deselect this tax type in the SELECT bar, then reselect it.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowTaxRateChangeWarning(false); setPendingTaxUpdate(null); }}
                  className="px-5 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTaxRateChange}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Confirm Change
                </button>
              </div>
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCategoryName.trim()) {
                      addExpenseCategory(newCategoryName.trim());
                      handleFieldChange("expense_type", newCategoryName.trim());
                      setShowAddCategoryInput(false);
                      setNewCategoryName("");
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
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        addExpenseCategory(newCategoryName.trim());
                        handleFieldChange("expense_type", newCategoryName.trim());
                        setShowAddCategoryInput(false);
                        setNewCategoryName("");
                      }
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
                <p className="text-sm text-gray-600 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  Confirmation: When editing an Expense Category all receipts associated with that Expense Category will also be updated.
                </p>
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
    </>
  );
};

export default ReceiptDetail;
