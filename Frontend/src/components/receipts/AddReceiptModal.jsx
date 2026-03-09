import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { X, Upload, FileText, Image, Trash2, ChevronDown, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../../context/DataContext";
import { usePaymentDisplay } from "../../hooks/usePaymentDisplay";
import MerchantAvatar from "../MerchantAvatar";
import { parseReceipt, pdfToImage, canvasToBlob } from "../../utils/receiptParser";

// Payment method logos (for Add Payment Method modal card type list)
import Visa from "../../assets/payment/Visa.png";
import MasterCard from "../../assets/payment/MasterCard.png";
import PayPal from "../../assets/payment/PayPal.png";
import AmericanExpress from "../../assets/payment/AmericanExpress.webp";
import Discover from "../../assets/payment/discover.png";
import DinersClub from "../../assets/payment/DinersClub.png";
import Cash from "../../assets/payment/Cash.jpg";
import DebitCard from "../../assets/payment/DebitCard.webp";
import Creditdebitcardicon from "../../assets/payment/Creditdebitcardicon.jpg";

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

const AddReceiptModal = ({ onClose, onReceiptAdded }) => {
  const {
    merchants,
    paymentMethods,
    receipts,
    expenseCategories,
    receiptTaxValues,
    taxData,
    merchantsWithImages,
    refreshData,
    addTax,
    updateTax,
    deleteTax,
    fetchTaxes,
    addExpenseCategory,
  } = useData();
  const { getPaymentLogo, getPaymentDisplay } = usePaymentDisplay();

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
  const [newPaymentCardType, setNewPaymentCardType] = useState("");
  const [newCardIssuerName, setNewCardIssuerName] = useState("");
  const [newLast4Digits, setNewLast4Digits] = useState("");
  const [newPaymentCategoryType, setNewPaymentCategoryType] = useState(""); // Business/Personal
  const [localPaymentMethods, setLocalPaymentMethods] = useState([]); // Local list of payment methods
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState([]);

  // Form fields state
  const [formData, setFormData] = useState({
    receipt_category: "", // 0 = Personal, 1 = Business
    storeName: "",
    expense_type: "",
    paymentType: "",
    card_issuer_name: "", // Card issuer name for display (e.g., "Omi")
    last_4_digit_card: "", // Last 4 digits for display
    product_date: new Date().toISOString().split("T")[0],
    subtotal: "",
    purchasePrice: "",
    product_name: "",
    notes: "",
    receipt_tax_values: [],
    tip: "", // Tip amount
  });

  // Tags state
  const [tags, setTags] = useState({
    starred: false,
    flagged: false,
    verified: false,
    reconciled: false,
    reimbursed: false,
    warrantied: false,
  });

  // Dropdown visibility states
  const [showMerchantDropdown, setShowMerchantDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showTaxDropdown, setShowTaxDropdown] = useState(null); // null, 1, or 2 for which tax field
  const [isMerchantTyping, setIsMerchantTyping] = useState(false); // Track if user is actively typing
  const [isPaymentTyping, setIsPaymentTyping] = useState(false); // Track if user is actively typing in payment field

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

  const fileInputRef = useRef(null);
  const merchantInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const paymentInputRef = useRef(null);

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

  // Default expense categories - same as used in the app
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

  // Helper function to validate expense category - filters out garbage values
  const isValidExpenseCategory = (category) => {
    if (!category) return false;
    const val = category.toString().trim();
    // Filter out numeric-only values, single characters, values with only digits/special chars
    if (/^\d+$/.test(val)) return false; // Pure numeric like "0", "1111"
    if (val.length < 2) return false; // Single characters
    if (/^[\d\W]+$/.test(val)) return false; // Only digits and special chars like "12qw" without letters
    if (/^\d+[a-zA-Z]?(-\d+)?$/.test(val)) return false; // Patterns like "1a", "1a-1"
    return true;
  };

  // Get all unique expense categories - use same data as Filter -> Expense Type
  // Filter out invalid/garbage values and combine with defaults
  const validExistingCategories = (expenseCategories || []).filter(
    isValidExpenseCategory,
  );

  const allExpenseCategories = [
    ...new Set([...defaultExpenseCategories, ...validExistingCategories]),
  ].sort((a, b) => a.localeCompare(b));

  // Get all merchants with their images from merchantsWithImages - deduplicated by name
  // Include locally added merchants
  const allMerchantsWithImages = (() => {
    const uniqueMap = new Map();
    // Add merchants from API
    (merchantsWithImages || []).forEach((m) => {
      const normalizedName = (m.name || "").toString().trim().toLowerCase();
      if (normalizedName && !uniqueMap.has(normalizedName)) {
        uniqueMap.set(normalizedName, m);
      }
    });
    // Add locally added merchants
    localMerchants.forEach((m) => {
      const normalizedName = (m.name || "").toString().trim().toLowerCase();
      if (normalizedName && !uniqueMap.has(normalizedName)) {
        uniqueMap.set(normalizedName, m);
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

    return null;
  };

  // Filter out invalid payment methods from existing data
  // These come from user's actual receipts (like "Bank of America *1111", "Visa *0177", etc.)
  const validExistingPayments = (paymentMethods || []).filter((p) => {
    if (!p) return false;
    const val = p.toString().trim();
    // Filter out "0", "0*0", "0*123" type invalid values
    if (val === "0" || val === "0*0" || /^0\*\d*$/.test(val)) return false;
    if (val.length < 2) return false;
    // Filter out "Cash *0", "Cash*0" variations - keep only "Cash"
    if (/^cash\s*\*\s*0$/i.test(val)) return false;
    // Filter out any payment ending with *0 (invalid card number)
    if (/\*\s*0$/.test(val)) return false;
    return true;
  });

  // Sort existing payments alphabetically
  const allPaymentMethods = [...new Set(validExistingPayments)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  // Use taxData from DataContext (fetched from /tax/getTax API)
  // Combine with receiptTaxValues for backward compatibility, plus any taxes added this session
  const allTaxTypes = useMemo(() => {
    const taxMap = new Map();

    const addToMap = (tax) => {
      console.log("Processing tax for dropdown:", tax);
      const name = (tax.tax_name || "").toString().trim();
      const rate = (tax.tax_rate || "").toString().trim();
      if (name && rate && !name.toLowerCase().includes("tip")) {
        const key = `${name}|${rate}`;
        if (!taxMap.has(key)) {
          console.log("Adding tax to map:", { name, rate, tax_number: tax.tax_number, id: tax.id, fk_user_id: tax.fk_user_id });
          taxMap.set(key, {
            tax_name: name,
            tax_rate: rate,
            tax_number: tax.tax_number || "",
            id: tax.id || 0,
            fk_user_id: tax.fk_user_id || 0,
          });
        }
      }
    };

    // Add taxes from taxData API (saved tax definitions)
    if (Array.isArray(taxData)) taxData.forEach(addToMap);

    // Add taxes from receiptTaxValues for backward compatibility
    if (Array.isArray(receiptTaxValues)) receiptTaxValues.forEach((tax) => {
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

    // Add locally-added taxes (created during this modal session) to ensure they always
    // appear even if the context taxData is reset by a background refreshData() call.
    if (Array.isArray(localTaxTypes)) localTaxTypes.forEach(addToMap);

    return Array.from(taxMap.values());
  }, [taxData, receiptTaxValues, localTaxTypes, taxDropdownKey]);

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
      formData.append("file", file); // API field name is "file", supports multiple
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

    // API returns array of { fullImageUrl: "string" }
    if (Array.isArray(data)) {
      return data.map((item) => item.fullImageUrl).filter(Boolean);
    }

    // Fallback: single object
    if (data?.fullImageUrl) {
      return [data.fullImageUrl];
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

  // Handle form field changes with auto-calculation
const handleFieldChange = (field, value) => {
  setFormData((prev) => {
    const newData = { ...prev, [field]: value };

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

  // Add tax type with auto-calculated amount based on current total, keep total fixed
  // Update your addTaxType function to ensure fk_tax_id is set correctly
  const addTaxType = (tax) => {
    console.log("=== addTaxType START ===");
    console.log("Tax to add:", tax);
    console.log("Current receipt tax values:", formData.receipt_tax_values);

    const exists = formData.receipt_tax_values.some(
      (t) => t.tax_name === tax.tax_name && t.tax_rate === tax.tax_rate,
    );
    console.log("Tax already exists:", exists);

    if (!exists) {
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

      const newTaxValues = [...formData.receipt_tax_values, taxToAdd];

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

    if (!newTaxName.trim() || !newTaxRate.trim()) {
      setError("Tax Name and Tax Rate are required");
      console.log("Validation failed: Missing required fields");
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
        tax_name: savedTax.tax_name || newTaxName.trim(),
        tax_rate: savedTax.tax_rate || newTaxRate.trim(),
        tax_amount: "",
        tax_number: savedTax.tax_number || newTaxNumber.trim() || "",
        id: savedTax.id || 0,
        fk_user_id: savedTax.fk_user_id || parseInt(fk_user_id),
      };

      // Reset form
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setShowManageTaxModal(false);
      setError(null);

      console.log("Form reset, modal closed");
      console.log("=== handleAddTaxType SUCCESS ===");

      // Persist this tax in the local session list so it survives any background refreshData() calls
      setLocalTaxTypes((prev) => {
        const exists = prev.some(
          (t) => t.tax_name === newTax.tax_name && t.tax_rate === newTax.tax_rate,
        );
        return exists ? prev : [...prev, newTax];
      });

      // Add the new tax type to the current receipt
      addTaxType(newTax);
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
    if (!editingTaxId || !newTaxName.trim() || !newTaxRate.trim()) {
      setError("Tax Name and Tax Rate are required");
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
        tax_rate: newTaxRate.trim(),
        tax_number: newTaxNumber.trim() || "",
        is_default_tax: existingTax?.is_default_tax || 0,
        is_tips: existingTax?.is_tips || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: 0,
      };

      await updateTax(taxPayload);

      // Reset form
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setEditingTaxId(null);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to update tax type. Please try again.");
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
    setNewTaxRate(tax.tax_rate || "");
    setNewTaxNumber(tax.tax_number || "");
    setError(null);
  };

  // Handle cancel edit - reset form
  const handleCancelEdit = () => {
    setEditingTaxId(null);
    setNewTaxName("");
    setNewTaxRate("");
    setNewTaxNumber("");
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

    try {
      const token = localStorage.getItem("token");
      const file = files[0];

      // ─── STEP 1: Upload media files to /user/uploadmediaV1 ───────────────
      let mediaUrls = [];
      try {
        console.log("Uploading files to uploadmediaV1...");
        setUploadProgress(10);
        mediaUrls = await uploadFilesToMedia(files); // upload ALL selected files
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
      // Priority: uploadmediaV1 URL > local object URL
      const imageUrl =
        mediaUrls[0] ||
        URL.createObjectURL(file);

      setUploadedImageUrl(imageUrl);

      // Store a minimal receipt-data stub (no id → 0) so handleSaveReceipt knows
      // this is a brand-new receipt and calls addReceiptv1 exactly once.
      setUploadedReceiptData({
        id: 0,
        receipt_image: imageUrl,
        emailAttachment: mediaUrls[0] || "0",
      });

      setUploadProgress(100);

      // ─── STEP 5: Pre-fill form with OCR + parsed data ─────────────────────
      let parsedDate = new Date().toISOString().split("T")[0];

      if (parsedReceiptData?.purchaseDate) {
        parsedDate = parsedReceiptData.purchaseDate;
      }

      const merchantName = parsedReceiptData?.merchantName || "";

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

      setFormData((prev) => ({
        ...prev,
        storeName: merchantName,
        expense_type: cleanTextValue(parsedReceiptData?.category || ""),
        paymentType: cleanPaymentType,
        card_issuer_name: "",
        last_4_digit_card: "",
        product_date: parsedDate,
        subtotal: cleanNumericValue(parsedReceiptData?.subtotal),
        purchasePrice: cleanNumericValue(parsedReceiptData?.total || parsedReceiptData?.subtotal),
        product_name: cleanTextValue(parsedReceiptData?.productName || ""),
        notes: "",
        receipt_tax_values: [],
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
        "0", // locked is always 0 for new receipts
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
        const dateObj = new Date(formData.product_date);
        if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() >= 2000) {
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

      // When updating an existing uploaded receipt, link taxes to its ID.
      // When creating new (no image), use 0 and the backend will set the correct ID.
      const taxReceiptId = parseInt(uploadedReceiptData?.id) || 0;

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
        if (Array.isArray(receiptTaxValues) && receiptTaxValues.length > 0) {
          baseTipTax = receiptTaxValues.find((t) =>
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

      // If the user uploaded an image, the backend already created a receipt during upload
      // (addReceiptv1 was called in handleFileUpload). In that case, use the returned ID so
      // the Save step UPDATES that same receipt instead of creating a duplicate.
      // If no image was uploaded, id stays 0 and addReceiptv1 will create the receipt.
      const uploadedId = parseInt(uploadedReceiptData?.id) || 0;
      const savePayload = {
        id: uploadedId, // Use uploaded receipt ID to update, or 0 to create new
        storeName: formData.storeName || "",
        product_name: formData.product_name || "",
        emailAttachment:
          (uploadedMediaUrls.length > 0 ? uploadedMediaUrls[0] : null) ||
          uploadedImageUrl ||
          uploadedReceiptData?.emailAttachment ||
          uploadedReceiptData?.receipt_image ||
          "0",
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
        receipt_image:
          uploadedReceiptData?.receipt_image ||
          uploadedReceiptData?.emailAttachment ||
          uploadedImageUrl ||
          "0",
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
              const updateData = await response.json();
              console.log(
                `=== API RESPONSE - Receipt Updated Successfully via ${endpoint} ===`,
              );
              console.log(
                "Full Update Response:",
                JSON.stringify(updateData, null, 2),
              );
              console.log(`Receipt updated successfully via ${endpoint}`);
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
            const createdData = await createResponse.json();
            console.log("=== API RESPONSE - Receipt Created Successfully ===");
            console.log(
              "Full API Response:",
              JSON.stringify(createdData, null, 2),
            );
            console.log(
              "Created Receipt ID:",
              createdData?.id ||
                createdData?.receipt?.id ||
                createdData?.data?.id,
            );
            console.log(
              "Created Receipt Data:",
              createdData?.receipt || createdData?.data || createdData,
            );
            // Update savePayload with the created receipt ID if returned
            if (
              createdData?.id ||
              createdData?.receipt?.id ||
              createdData?.data?.id
            ) {
              savePayload.id =
                createdData?.id ||
                createdData?.receipt?.id ||
                createdData?.data?.id;
            }
          } else {
            const errorText = await createResponse.text();
            console.error("=== API ERROR - Failed to create receipt ===");
            console.error("Error Status:", createResponse.status);
            console.error("Error Response:", errorText);
            throw new Error(
              `Failed to create receipt: ${createResponse.status}`,
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
          receipt_image:
            savePayload.receipt_image ||
            uploadedImageUrl ||
            uploadedReceiptData?.receipt_image ||
            "0",
        });
      } else {
        // If no callback, we still need to refresh data
        // But we can't call refreshData directly here, so just close modal
        // The parent component should handle refresh
        console.log(
          "No onReceiptAdded callback - parent should handle data refresh",
        );
      }

      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save receipt. Please try again.");
    } finally {
      setIsSaving(false);
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

      const logoUrls = [];

      // Handle the specific array response format from imagesearch API
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          if (item && typeof item === "object") {
            const url =
              item.fullurl ||
              item.url ||
              item.image ||
              item.src ||
              item.link ||
              item.thumburl;
            if (url && /^https?:\/\//i.test(url)) {
              logoUrls.push(url);
            }
          }
        }
      }

      // Handle object response
      if (typeof data === "object" && !Array.isArray(data)) {
        const arr =
          data.images || data.results || data.data || data.items || [];
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            if (item && typeof item === "object") {
              const url =
                item.fullurl || item.url || item.image || item.src || item.link;
              if (url && /^https?:\/\//i.test(url)) {
                logoUrls.push(url);
              }
            }
          }
        }

        const directUrl =
          data.url || data.image || data.src || data.link || data.fullurl;
        if (directUrl && /^https?:\/\//i.test(directUrl)) {
          logoUrls.push(directUrl);
        }
      }

      return logoUrls;
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
          setNewMerchantLogo(logos[0]);
        } else {
          setSelectedLogoIndex(null);
          setNewMerchantLogo("");
        }
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [newMerchantName, showAddMerchantModal, fetchMerchantLogos]);
  
  // Add this useEffect after your other useEffects
  useEffect(() => {
    if (!showManageTaxModal) {
      // When the Manage Tax Types modal closes, refresh taxes
      const refreshTaxes = async () => {
        await fetchTaxes();
      };
      refreshTaxes();
    }
  }, [showManageTaxModal, fetchTaxes]);
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
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

const handleOpenAddMerchantModal = () => {
  setNewMerchantName(formData.storeName || "");
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
  setNewMerchantLogo(logoOptions[index]);
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
      setNewMerchantLogo(logos[0]);
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
  // Replace your existing handleAddMerchant with this
  const handleAddMerchant = async () => {
    if (!newMerchantName || newMerchantName.trim().length === 0) {
      setError("Merchant name is required");
      return;
    }

    if (!newMerchantLogo || newMerchantLogo.trim().length === 0) {
      setError(
        "Merchant logo is required. Please select a logo from the options.",
      );
      return;
    }

    // Check if merchant already exists in global merchants
    const normalizedName = newMerchantName.trim().toLowerCase();
    const exists = allMerchantsWithImages.some(
      (m) => m.name?.toLowerCase() === normalizedName,
    );

    if (exists) {
      setError("This merchant already exists");
      return;
    }

    // Add merchant to local list only — the logo will be saved as part of the
    // actual receipt when the user clicks "Save Receipt". No separate DB receipt
    // should be created here, as that causes a blank duplicate receipt.
    const newMerchant = {
      name: newMerchantName.trim(),
      image: newMerchantLogo.trim(),
    };

    setLocalMerchants((prev) => [...prev, newMerchant]);

    // Select the new merchant in the form
    handleFieldChange("storeName", newMerchant.name);
    setDetectedMerchantLogo(null);

    // Reset form and close modal
    setNewMerchantName("");
    setNewMerchantLogo("");
    setLogoOptions([]);
    setSelectedLogoIndex(null);
    setShowAddMerchantModal(false);
    setShowMerchantDropdown(false);

    // Show success message
    setToast?.({
      isVisible: true,
      message: "Merchant added successfully!",
      type: "success",
    });
  };

  // Handle opening Add Payment Method modal
  const handleOpenAddPaymentModal = () => {
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
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setShowAddPaymentModal(false);
    setError(null);
  };

  // Handle adding new payment method
  const handleAddPaymentMethod = () => {
    if (!newPaymentCardType || newPaymentCardType.trim().length === 0) {
      setError("Payment Card Type is required");
      return;
    }

    // Determine card issuer name - ALWAYS use what user entered in cardIssuerName field
    // Only fallback to payment card type if user didn't enter anything
    let finalCardIssuerName = newCardIssuerName.trim();
    const cardTypeLower = newPaymentCardType.trim().toLowerCase();

    // Determine the selected card type for logo detection FIRST (before using it)
    // This is the actual card type selected (e.g., "Diners Club") even if custom issuer name was entered
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

    // If user didn't enter a card issuer name, use payment card type as fallback
    if (!finalCardIssuerName) {
      finalCardIssuerName = selectedCardTypeForLogo;
    }

    // Build payment method string
    // IMPORTANT: Use selectedCardTypeForLogo for paymentType (for logo detection)
    // But use finalCardIssuerName for display (card_issuer_name)
    // This ensures correct logo even when custom issuer name is entered
    let paymentMethodString = selectedCardTypeForLogo || finalCardIssuerName;

    // Add last 4 digits if provided
    if (newLast4Digits && newLast4Digits.trim().length > 0) {
      const last4 = newLast4Digits.trim().replace(/\D/g, "").slice(0, 4);
      if (last4.length > 0) {
        paymentMethodString = `${paymentMethodString} *${last4}`;
      }
    }

    // Add to local payment methods list
    const newPaymentMethod = {
      paymentType: paymentMethodString,
      cardIssuerName: finalCardIssuerName, // Display name (can be custom)
      selectedCardType: selectedCardTypeForLogo, // Card type for logo detection
      last4DigitCard:
        newLast4Digits.trim().replace(/\D/g, "").slice(0, 4) || "",
      paymentCategoryType: newPaymentCategoryType || "Personal",
    };

    setLocalPaymentMethods((prev) => [...prev, newPaymentMethod]);

    // Select the new payment method
    // paymentType should be the card type (selectedCardTypeForLogo) for logo detection
    handleFieldChange(
      "paymentType",
      selectedCardTypeForLogo || paymentMethodString,
    );

    // Set card_issuer_name for display (custom name if entered, otherwise card type)
    handleFieldChange("card_issuer_name", finalCardIssuerName);

    // Set last_4_digit_card if provided
    if (newLast4Digits && newLast4Digits.trim().length > 0) {
      const last4 = newLast4Digits.trim().replace(/\D/g, "").slice(0, 4);
      if (last4.length > 0) {
        handleFieldChange("last_4_digit_card", last4);
      }
    }

    // Set payment category type (Business/Personal)
    if (newPaymentCategoryType === "Business") {
      handleFieldChange("receipt_category", "1");
    } else if (newPaymentCategoryType === "Personal") {
      handleFieldChange("receipt_category", "0");
    }

    // Reset form and close modal
    handleCloseAddPaymentModal();
    setShowPaymentDropdown(false);
  };

  // Filter functions for dropdowns - use merchantsWithImages
  // Show all merchants when dropdown opens, only filter when user is actively typing
  const filteredMerchants = (() => {
    if (!isMerchantTyping && !formData.storeName) {
      // Show all when dropdown opens and no value
      return allMerchantsWithImages;
    }
    if (!isMerchantTyping) {
      // Show all when dropdown opens even if there's a value (from auto-detection)
      return allMerchantsWithImages;
    }
    // Filter only when user is actively typing
    const searchTerm = (formData.storeName || "").toLowerCase();
    if (!searchTerm) {
      return allMerchantsWithImages;
    }
    return allMerchantsWithImages.filter((m) =>
      m.name?.toLowerCase().includes(searchTerm),
    );
  })();

  const filteredCategories = allExpenseCategories.filter((c) =>
    c.toLowerCase().includes((formData.expense_type || "").toLowerCase()),
  );

  // Payment card types with logos - matching mobile app options
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

  // Filter payment methods - show all options when dropdown opens, filter when typing
  // Convert localPaymentMethods objects to display format: cardIssuerName *last4 (not paymentType)
  const localPaymentMethodStrings = localPaymentMethods.map((pm) => {
    // Use cardIssuerName for display (card issuer name + last4), not paymentType (card type + last4)
    const issuerName = pm.cardIssuerName || "";
    const last4 = pm.last4DigitCard || "";
    if (issuerName && last4) {
      return `${issuerName} *${last4}`;
    } else if (issuerName) {
      return issuerName;
    }
    // Fallback to paymentType if cardIssuerName not available
    return pm.paymentType || "";
  });

  // Deduplicate payment methods - if a custom issuer name version exists, remove generic one
  // Example: If "HelloPayPal *0000" exists, remove "PayPal *0000"
  const deduplicatePaymentMethods = (methods) => {
    const methodMap = new Map();
    const last4ToMethods = new Map(); // Track methods by last4 digits

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
        // Group methods by last4 digits
        if (!last4ToMethods.has(last4)) {
          last4ToMethods.set(last4, []);
        }
        last4ToMethods.get(last4).push({ methodStr, baseName });
      } else {
        // Methods without last4 - add directly
        methodMap.set(methodStr, methodStr);
      }
    });

    // For each last4 group, keep only the most specific issuer name
    last4ToMethods.forEach((methodsWithSameLast4, last4) => {
      // Sort by length (longer = more specific, e.g., "HelloPayPal" > "PayPal")
      methodsWithSameLast4.sort(
        (a, b) => b.baseName.length - a.baseName.length,
      );
      // Keep only the first (most specific) one
      methodMap.set(
        methodsWithSameLast4[0].methodStr,
        methodsWithSameLast4[0].methodStr,
      );
    });

    return Array.from(methodMap.values());
  };

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
            <div className="bg-white rounded-xl shadow-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-gray-200 relative">
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
              {/* Modal Header - Same as ReceiptDetail */}
              <div className="receipt-modal-header flex items-center border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-2.5 bg-white sticky top-0 z-20">
                {/* Close Button - Left side */}
                <div className="w-[90px] sm:w-[130px] flex justify-start gap-1">
                  <button
                    onClick={onClose}
                    disabled={isUploading || isSaving}
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
                </div>

                {/* Title - Center */}
                <h2 className="flex-1 text-center text-sm sm:text-base md:text-lg font-bold text-gray-900">
                  Add Receipt
                </h2>

                {/* Right side - Delete icon for form step */}
                <div className="w-[90px] sm:w-[130px] flex items-center justify-end gap-1 sm:gap-2">
                  {step === "form" && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep("upload");
                        setFiles([]);
                        setUploadedReceiptData(null);
                        setLocalImageFile(null);
                        setDetectedMerchantLogo(null);
                      }}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-red-50 rounded-full transition-colors group"
                      aria-label="Delete"
                      title="Remove and start over"
                    >
                      <Trash2
                        size={16}
                        className="text-red-500 group-hover:text-red-600 "
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto max-h-[calc(95vh-70px)] sm:max-h-[calc(90vh-80px)]">
                {step === "upload" ? (
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
                        className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                      >
                        {/* existing content */}
                      </div>
                    )}
                    {showTaxDropdown === 2 && (
                      <div
                        key={`tax-dropdown-2-${taxDropdownKey}`}
                        className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
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
                        onClick={() => {
                          // Skip image upload and go directly to form with empty data
                          setFiles([]);
                          setLocalImageFile(null);
                          setUploadedImageUrl(null);
                          setUploadedReceiptData(null);
                          setParsedData(null);
                          setStep("form");
                        }}
                        disabled={isUploading}
                        className="px-6 py-2 bg-gray-500 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Skip
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
                  <form onSubmit={handleSaveReceipt}>
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
      <input
        className={`${inputClass} pl-8`}
        value={formData.storeName}
        onChange={(e) => {
          const newMerchantName = e.target.value;
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
                filteredMerchants.map((merchant, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2"
                    onClick={() => {
                      // Clear detected logo when selecting a different merchant
                      if (
                        merchant.name !==
                        uploadedReceiptData?.storeName
                      ) {
                        setDetectedMerchantLogo(null);
                      }
                      handleFieldChange(
                        "storeName",
                        merchant.name,
                      );
                      setIsMerchantTyping(false);
                      setShowMerchantDropdown(false);
                    }}
                  >
                    <MerchantAvatar
                      name={merchant.name}
                      explicitUrl={merchant.image}
                      className="w-5 h-5 mt-2"
                    />
                    {merchant.name}
                  </div>
                ))
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
          handleFieldChange(
            "expense_type",
            e.target.value,
          );
          setShowCategoryDropdown(true);
        }}
        onFocus={() => setShowCategoryDropdown(true)}
        placeholder="e.g., Restaurants, Fuel, General Retail"
      />
      <ChevronDown
        size={16}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
        onClick={() =>
          setShowCategoryDropdown(!showCategoryDropdown)
        }
      />
      {showCategoryDropdown &&
        filteredCategories.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filteredCategories.map((category, idx) => (
              <div
                key={idx}
                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left"
                onClick={() => {
                  handleFieldChange(
                    "expense_type",
                    category,
                  );
                  setShowCategoryDropdown(false);
                }}
              >
                {category}
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
          // Display format: card issuer name *last4 (like homepage)
          const issuerName =
            formData.card_issuer_name || "";
          const last4 = formData.last_4_digit_card || "";
          if (issuerName && last4) {
            return `${issuerName} *${last4}`;
          } else if (issuerName) {
            return issuerName;
          }
          // Fallback to paymentType if card_issuer_name not set
          return formData.paymentType || "";
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
          if (
            matchingLocalMethod &&
            matchingLocalMethod.selectedCardType
          ) {
            cardType =
              matchingLocalMethod.selectedCardType;
          } else {
            // Try to detect card type from card issuer name for logo detection
            const issuerLower =
              cardIssuerName.toLowerCase();

            // Check if issuer name contains a known card type
            if (issuerLower.includes("paypal"))
              cardType = "PayPal";
            else if (issuerLower.includes("visa"))
              cardType = "Visa";
            else if (issuerLower.includes("master"))
              cardType = "MasterCard";
            else if (
              issuerLower.includes("amex") ||
              issuerLower.includes("american express")
            )
              cardType = "American Express";
            else if (issuerLower.includes("discover"))
              cardType = "Discover";
            else if (issuerLower.includes("diners"))
              cardType = "Diners Club";
            else if (issuerLower.includes("debit"))
              cardType = "Debit Card";
            else if (issuerLower.includes("cash"))
              cardType = "Cash";
            // If no card type detected, keep the issuer name (will show generic logo)
          }

          // Update paymentType (for API - card type for logo detection)
          handleFieldChange("paymentType", cardType);

          // Always update card_issuer_name (including empty) so user can clear the field
          handleFieldChange(
            "card_issuer_name",
            cardIssuerName,
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

              // Format display: issuer name *last4 (or just issuer name if no last4)
              const displayText = issuerName
                ? last4
                  ? `${issuerName} *${last4}`
                  : issuerName
                : methodString; // Fallback to original if no issuer name

              return (
                <div
                  key={`payment-${methodString}-${idx}`}
                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2"
                  onClick={() => {
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
                      // Use cardIssuerName from localPaymentMethod for display
                      handleFieldChange(
                        "card_issuer_name",
                        matchingLocalMethod.cardIssuerName ||
                          cardIssuerName,
                      );
                    } else {
                      // For methods from allPaymentMethods, extract card type from the issuer name for logo
                      // But use the issuer name as card_issuer_name for display
                      const baseName =
                        cardIssuerName.toLowerCase();
                      let cardType = cardIssuerName; // Default to issuer name

                      // Try to detect card type from issuer name
                      if (baseName.includes("visa"))
                        cardType = "Visa";
                      else if (
                        baseName.includes("master")
                      )
                        cardType = "MasterCard";
                      else if (
                        baseName.includes("paypal")
                      )
                        cardType = "PayPal";
                      else if (
                        baseName.includes("amex") ||
                        baseName.includes(
                          "american express",
                        )
                      )
                        cardType = "American Express";
                      else if (
                        baseName.includes("discover")
                      )
                        cardType = "Discover";
                      else if (
                        baseName.includes("diners")
                      )
                        cardType = "Diners Club";
                      else if (baseName.includes("debit"))
                        cardType = "Debit Card";
                      else if (baseName.includes("cash"))
                        cardType = "Cash";
                      else {
                        // Issuer name doesn't contain a known card network keyword
                        // (e.g. "Chase", "Bank of America"). Look up the matching
                        // receipt to get its actual paymentType (e.g. "MasterCard *7836"),
                        // which carries the real card network for logo detection.
                        const matchingReceiptForCardType =
                          (receipts || []).find(
                            (r) =>
                              getPaymentDisplay(r) ===
                              methodString,
                          );
                        const receiptPaymentType = (
                          matchingReceiptForCardType?.paymentType ||
                          matchingReceiptForCardType?.payment_type ||
                          ""
                        )
                          .replace(/\s*\*\d{3,4}$/, "")
                          .trim();

                        // Use the receipt's card network type if it's a known network;
                        // otherwise fall back to the issuer name so the bank logo
                        // detection in getPaymentLogo can still match bank names.
                        const receiptTypeLower =
                          receiptPaymentType.toLowerCase();
                        if (
                          receiptTypeLower.includes(
                            "visa",
                          )
                        )
                          cardType = "Visa";
                        else if (
                          receiptTypeLower.includes(
                            "master",
                          )
                        )
                          cardType = "MasterCard";
                        else if (
                          receiptTypeLower.includes(
                            "paypal",
                          )
                        )
                          cardType = "PayPal";
                        else if (
                          receiptTypeLower.includes(
                            "amex",
                          ) ||
                          receiptTypeLower.includes(
                            "american express",
                          )
                        )
                          cardType = "American Express";
                        else if (
                          receiptTypeLower.includes(
                            "discover",
                          )
                        )
                          cardType = "Discover";
                        else if (
                          receiptTypeLower.includes(
                            "diners",
                          )
                        )
                          cardType = "Diners Club";
                        else if (
                          receiptTypeLower.includes(
                            "debit",
                          )
                        )
                          cardType = "Debit Card";
                        else {
                          // No card network found anywhere — pass the issuer
                          // name as paymentType so getPaymentLogo can still
                          // apply bank-name detection (returns bank/MasterCard logo).
                          cardType = cardIssuerName;
                        }
                      }

                      handleFieldChange(
                        "paymentType",
                        cardType,
                      );
                      // Use card issuer name for display (keep original name like "Chase")
                      handleFieldChange(
                        "card_issuer_name",
                        cardIssuerName,
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

                    setIsPaymentTyping(false);
                    setShowPaymentDropdown(false);
                  }}
                >
                  {(() => {
                    // Logo = card type (Visa, MasterCard, etc.). Prefer receipt so we use its paymentType.
                    let logo;
                    if (
                      matchingLocalMethod?.selectedCardType
                    ) {
                      logo = getPaymentLogo({
                        paymentType:
                          matchingLocalMethod.selectedCardType,
                        card_issuer_name: issuerName,
                      });
                    } else {
                      const matchingReceipt = (
                        receipts || []
                      ).find(
                        (r) =>
                          getPaymentDisplay(r) ===
                          methodString,
                      );
                      logo = matchingReceipt
                        ? getPaymentLogo(matchingReceipt)
                        : getPaymentLogo({
                            paymentType: methodString,
                            card_issuer_name: issuerName,
                          });
                    }
                    return logo ? (
                      <img
                        src={logo}
                        alt={displayText}
                        className="w-5 h-5 rounded object-contain mt-2"
                      />
                    ) : null;
                  })()}
                  <span>{displayText}</span>
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
                            type="number"
                            step="0.01"
                            readOnly
                            className={inputClass}
                            value={formData.subtotal}
                            placeholder="0.00"
                          />
                        </div>

                        {/* Tax Type #1 with Add button */}
                        <div className="mb-4 text-align-left">
                          <div className="flex items-center justify-between">
                            <label className="font-bold">
                              {formData.receipt_tax_values[0]
                                ? `${
                                    formData.receipt_tax_values[0].tax_name
                                  } (${Math.round(
                                    parseFloat(
                                      formData.receipt_tax_values[0].tax_rate,
                                    ) || 0,
                                  )}%)`
                                : "Tax Type #1 (0%)"}
                            </label>
                            <div className="flex items-center gap-2">
                              {formData.receipt_tax_values[0] && (
                                <button
                                  type="button"
                                  onClick={() => removeTaxType(0)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                  title="Remove tax type"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {!formData.receipt_tax_values[0] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowTaxDropdown(
                                      showTaxDropdown === 1 ? false : 1,
                                    )
                                  }
                                  className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:text-blue-800 mt-0 mb-0"
                                >
                                  <Plus size={12} /> Add Tax
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              value={
                                formData.receipt_tax_values[0]?.tax_amount || ""
                              }
                              onChange={(e) =>
                                formData.receipt_tax_values[0] &&
                                updateTaxAmount(0, e.target.value)
                              }
                              placeholder={
                                formData.receipt_tax_values[0] ? "0.00" : "-"
                              }
                              readOnly={!formData.receipt_tax_values[0]}
                            />
                            {showTaxDropdown === 1 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                                {allTaxTypes.length > 0 ? (
                                  <>
                                    {allTaxTypes.map((tax, idx) => {
                                      console.log(`Rendering tax ${idx}:`, tax);
                                      return (
                                        <div
                                          key={idx}
                                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm"
                                          onClick={() => {
                                            console.log("Tax clicked:", tax);
                                            addTaxType(tax);
                                            setShowTaxDropdown(false);
                                          }}
                                        >
                                          {tax.tax_name} (
                                          {Math.round(
                                            parseFloat(tax.tax_rate) || 0,
                                          )}
                                          %)
                                        </div>
                                      );
                                    })}
                                    <div className="border-t border-gray-200 mt-1">
                                      <div
                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium"
                                        onClick={() => {
                                          console.log(
                                            "=== Manage Tax Types clicked ===",
                                          );
                                          console.log("Current step:", step);
                                          setShowTaxDropdown(false);
                                          setShowManageTaxModal(true);
                                          console.log("Modal should open now");
                                        }}
                                      >
                                        <Plus
                                          size={14}
                                          className="inline mr-1"
                                        />
                                        Manage Tax Types
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="px-3 py-2 text-gray-500 text-sm">
                                      No tax types available
                                    </div>
                                    <div className="border-t border-gray-200 mt-1">
                                      <div
                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium"
                                        onClick={() => {
                                          console.log(
                                            "=== Manage Tax Types clicked ===",
                                          );
                                          console.log("Current step:", step);
                                          setShowTaxDropdown(false);
                                          setShowManageTaxModal(true);
                                          console.log("Modal should open now");
                                        }}
                                      >
                                        <Plus
                                          size={14}
                                          className="inline mr-1"
                                        />
                                        Manage Tax Types
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tax Type #2 with Add button */}
                        <div className="mb-4 text-align-left">
                          <div className="flex items-center justify-between">
                            <label className="font-bold">
                              {formData.receipt_tax_values[1]
                                ? `${
                                    formData.receipt_tax_values[1].tax_name
                                  } (${Math.round(
                                    parseFloat(
                                      formData.receipt_tax_values[1].tax_rate,
                                    ) || 0,
                                  )}%)`
                                : "Tax Type #2 (0%)"}
                            </label>
                            <div className="flex items-center gap-2">
                              {formData.receipt_tax_values[1] && (
                                <button
                                  type="button"
                                  onClick={() => removeTaxType(1)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                  title="Remove tax type"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {formData.receipt_tax_values[0] &&
                                !formData.receipt_tax_values[1] && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowTaxDropdown(
                                        showTaxDropdown === 2 ? false : 2,
                                      )
                                    }
                                    className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:text-blue-800"
                                  >
                                    <Plus size={12} /> Add Tax
                                  </button>
                                )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              value={
                                formData.receipt_tax_values[1]?.tax_amount || ""
                              }
                              onChange={(e) =>
                                formData.receipt_tax_values[1] &&
                                updateTaxAmount(1, e.target.value)
                              }
                              placeholder={
                                formData.receipt_tax_values[1] ? "0.00" : "-"
                              }
                              readOnly={!formData.receipt_tax_values[1]}
                            />
                            {showTaxDropdown === 2 && (
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                                {allTaxTypes.length > 0 ? (
                                  <>
                                    {allTaxTypes.map((tax, idx) => {
                                      console.log(`Rendering tax ${idx}:`, tax);
                                      return (
                                        <div
                                          key={idx}
                                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm"
                                          onClick={() => {
                                            console.log("Tax clicked:", tax);
                                            addTaxType(tax);
                                            setShowTaxDropdown(false);
                                          }}
                                        >
                                          {tax.tax_name} (
                                          {Math.round(
                                            parseFloat(tax.tax_rate) || 0,
                                          )}
                                          %)
                                        </div>
                                      );
                                    })}
                                    <div className="border-t border-gray-200 mt-1">
                                      <div
                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium"
                                        onClick={() => {
                                          console.log(
                                            "=== Manage Tax Types clicked ===",
                                          );
                                          console.log("Current step:", step);
                                          setShowTaxDropdown(false);
                                          setShowManageTaxModal(true);
                                          console.log("Modal should open now");
                                        }}
                                      >
                                        <Plus
                                          size={14}
                                          className="inline mr-1"
                                        />
                                        Manage Tax Types
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="px-3 py-2 text-gray-500 text-sm">
                                      No tax types available
                                    </div>
                                    <div className="border-t border-gray-200 mt-1">
                                      <div
                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left text-sm text-blue-600 font-medium"
                                        onClick={() => {
                                          console.log(
                                            "=== Manage Tax Types clicked ===",
                                          );
                                          console.log("Current step:", step);
                                          setShowTaxDropdown(false);
                                          setShowManageTaxModal(true);
                                          console.log("Modal should open now");
                                        }}
                                      >
                                        <Plus
                                          size={14}
                                          className="inline mr-1"
                                        />
                                        Manage Tax Types
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* TIP */}
                        <div className="mb-4 text-align-left">
                          <label className="font-bold">
                            TIP (
                            {formData.tip &&
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
                          <input
                            type="number"
                            step="0.01"
                            className={inputClass}
                            value={formData.tip}
                            onChange={(e) =>
                              handleFieldChange("tip", e.target.value)
                            }
                            placeholder="0.00"
                          />
                        </div>

                        {/* Total */}
                        <div className="mb-4 text-align-left">
                          <label className="font-bold">TOTAL</label>
                          <input
                            type="number"
                            step="0.01"
                            className={inputClass}
                            value={formData.purchasePrice}
                            onChange={(e) =>
                              handleFieldChange("purchasePrice", e.target.value)
                            }
                            placeholder="0.00"
                          />
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
                        className="w-full border border-blue-400 rounded-md p-2 mb-2 text-sm"
                        value={formData.product_name || ""}
                        onChange={(e) =>
                          handleFieldChange("product_name", e.target.value)
                        }
                        placeholder="e.g., Nespresso VertuoPlus Espresso Maker"
                      />
                      <h3 className="font-semibold mb-2 text-gray-900">
                        Notes
                      </h3>
                      <textarea
                        className="w-full border border-blue-400 rounded-md p-2 mb-2 text-sm"
                        value={formData.notes || ""}
                        onChange={(e) =>
                          handleFieldChange("notes", e.target.value)
                        }
                        placeholder="e.g., Birthday gift for Mom"
                      />

                      {/* Tags Section - Same as ReceiptDetail */}
                      <h3 className="font-semibold mb-2 text-gray-900">Tags</h3>
                      <div className="w-full overflow-x-auto hide-scrollbar">
                        <div
                          className="flex gap-2 pb-2"
                          style={{ minWidth: "max-content" }}
                        >
                          {/* Starred */}
                          <button
                            type="button"
                            onClick={() => toggleTag("starred")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.starred
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("starred", tags.starred)}
                              alt="Starred"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">Starred</span>
                          </button>

                          {/* Flagged */}
                          <button
                            type="button"
                            onClick={() => toggleTag("flagged")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.flagged
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("flagged", tags.flagged)}
                              alt="Flagged"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">Flagged</span>
                          </button>

                          {/* Verified */}
                          <button
                            type="button"
                            onClick={() => toggleTag("verified")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.verified
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("verified", tags.verified)}
                              alt="Verified"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">
                              Verified
                            </span>
                          </button>

                          {/* Reconciled */}
                          <button
                            type="button"
                            onClick={() => toggleTag("reconciled")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.reconciled
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("reconciled", tags.reconciled)}
                              alt="Reconciled"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">
                              Reconciled
                            </span>
                          </button>

                          {/* Reimbursed */}
                          <button
                            type="button"
                            onClick={() => toggleTag("reimbursed")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.reimbursed
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("reimbursed", tags.reimbursed)}
                              alt="Reimbursed"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">
                              Reimbursed
                            </span>
                          </button>

                          {/* Warrantied */}
                          <button
                            type="button"
                            onClick={() => toggleTag("warrantied")}
                            className={`flex items-center gap-1 px-3 py-2 border rounded-full ${
                              tags.warrantied
                                ? "border-blue-500 text-blue-600"
                                : "border-gray-300"
                            }`}
                          >
                            <img
                              src={getTagImage("warrantied", tags.warrantied)}
                              alt="Warrantied"
                              className="w-4 h-4 object-contain"
                            />
                            <span className="text-xs font-medium">
                              Warrantied
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Receipt Image Section */}
                    <div className="px-6 pb-6 text-left">
                      <h3 className="font-semibold mb-2 text-gray-900">
                        RECEIPT IMAGES
                      </h3>
                      <div className="border border-dashed border-blue-400 rounded-lg p-3 flex gap-4 flex-wrap">
                        {uploadedMediaUrls.length > 0 ? (
                          // Show all uploaded media - use local preview for PDFs since CDN URLs can't render in <img>
                          uploadedMediaUrls.map((url, idx) => {
                            // Determine display URL: for PDFs use pdfPreviewUrl, for images use the CDN url
                            const isPdfUrl =
                              url.toLowerCase().includes(".pdf") ||
                              (localImageFile &&
                                (localImageFile.type === "application/pdf" ||
                                  localImageFile.name
                                    .toLowerCase()
                                    .endsWith(".pdf")));
                            const displayUrl = isPdfUrl
                              ? pdfPreviewUrl || getImagePreviewUrl()
                              : url;

                            if (!displayUrl) return null;

                            return (
                              <img
                                key={idx}
                                src={displayUrl}
                                alt={`Receipt ${idx + 1}`}
                                className="w-24 h-auto rounded cursor-pointer border border-gray-200"
                                onClick={() => window.open(url, "_blank")} // open the actual CDN URL on click
                              />
                            );
                          })
                        ) : getImagePreviewUrl() ? (
                          <img
                            src={getImagePreviewUrl()}
                            alt="Receipt"
                            className="w-24 h-auto rounded cursor-pointer"
                            onClick={() =>
                              window.open(getImagePreviewUrl(), "_blank")
                            }
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full py-8 text-gray-500 italic">
                            No receipt image available
                          </div>
                        )}
                      </div>

                      {/* Error Message */}
                      {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                          {error}
                        </div>
                      )}

                      {/* Save Button */}
                      <div className="mt-6 flex justify-end">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSaving ? "Saving..." : "Save Receipt"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
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

      {/* Add Payment Method Modal - Overlay on top of Add Receipt Modal */}
      <AnimatePresence>
        {showAddPaymentModal && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleCloseAddPaymentModal}
          >
            <motion.div
              variants={modalVariants}
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
                  aria-label="Close"
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
                            style={{ imageRendering: "auto" }}
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

                {/* Card Issuer Name & Last 4 Digits - Side by Side */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Card Issuer & Card Number (Last 4 digits)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        className={`${inputClass} w-full`}
                        value={newCardIssuerName}
                        onChange={(e) => setNewCardIssuerName(e.target.value)}
                        placeholder="Enter Card Issuer (e.g., SBI)"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className={`${inputClass} w-full`}
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
                </div>

                {/* Payment Category Type (Business/Personal) */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Payment Category Type
                  </label>
                  <select
                    className={inputClass}
                    value={newPaymentCategoryType}
                    onChange={(e) => setNewPaymentCategoryType(e.target.value)}
                  >
                    <option value="">Select Category Type</option>
                    <option value="Personal">Personal</option>
                    <option value="Business">Business</option>
                  </select>
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
                    onClick={handleCloseAddPaymentModal}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddPaymentMethod}
                    disabled={!newPaymentCardType}
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
                      setNewMerchantName(e.target.value);
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
                      Merchant Logo <span className="text-red-500">*</span>
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
                        {logoOptions.map((logoUrl, index) => (
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
                              src={logoUrl}
                              alt={`Logo option ${index + 1}`}
                              className="max-w-full max-h-16 w-auto h-auto object-contain"
                              style={{ imageRendering: "auto" }}
                              onError={(e) => {
                                e.target.style.display = "none";
                                e.target.parentElement.innerHTML =
                                  '<div class="w-full min-h-[80px] flex items-center justify-center text-xs text-gray-400">Failed to load</div>';
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
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Selected Logo:
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[80px] min-h-[80px]">
                          <img
                            src={newMerchantLogo}
                            alt="Selected merchant logo"
                            className="max-w-full max-h-20 w-auto h-auto object-contain"
                            style={{ imageRendering: "auto" }}
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-600 break-all">
                            {newMerchantLogo}
                          </p>
                        </div>
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
                      !newMerchantName || !newMerchantLogo || isFetchingLogos
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
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!isSavingTax && !isDeletingTax) {
                setShowManageTaxModal(false);
                setNewTaxName("");
                setNewTaxRate("");
                setNewTaxNumber("");
                setError(null);
                setEditingTaxId(null);
              }
            }}
          >
            <motion.div
              variants={modalVariants}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
                <h2 className="text-xl font-bold text-gray-900">
                  Manage Tax Types
                </h2>
                <button
                  onClick={() => {
                    if (!isSavingTax && !isDeletingTax) {
                      setShowManageTaxModal(false);
                      setNewTaxName("");
                      setNewTaxRate("");
                      setNewTaxNumber("");
                      setError(null);
                      setEditingTaxId(null);
                    }
                  }}
                  disabled={isSavingTax || isDeletingTax}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Existing Taxes List */}
                {allTaxTypes.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">
                      Existing Tax Types
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {allTaxTypes.map((tax) => (
                        <div
                          key={tax.id || `${tax.tax_name}-${tax.tax_rate}`}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {tax.tax_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              Rate: {tax.tax_rate}%
                              {tax.tax_number && ` | Number: ${tax.tax_number}`}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditTax(tax)}
                              disabled={
                                isSavingTax ||
                                isDeletingTax ||
                                editingTaxId === tax.id
                              }
                              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTax(tax.id || 0)}
                              disabled={
                                isSavingTax ||
                                isDeletingTax ||
                                editingTaxId !== null
                              }
                              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add/Edit Tax Form */}
                <div className="border-t pt-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">
                    {editingTaxId ? "Edit Tax Type" : "Add New Tax Type"}
                  </h3>

                  {/* Tax Name Field */}
                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Tax Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={`${inputClass} w-full`}
                      value={newTaxName}
                      onChange={(e) => setNewTaxName(e.target.value)}
                      placeholder="Enter Tax Name"
                      autoFocus
                    />
                  </div>

                  {/* Tax Rate Field */}
                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Tax Rate (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className={`${inputClass} w-full`}
                      value={newTaxRate}
                      onChange={(e) => setNewTaxRate(e.target.value)}
                      placeholder="Enter Tax Rate (%)"
                    />
                  </div>

                  {/* Tax Number Field (Optional) */}
                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Tax Number{" "}
                      <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className={`${inputClass} w-full`}
                      value={newTaxNumber}
                      onChange={(e) => setNewTaxNumber(e.target.value)}
                      placeholder="Enter Tax Number"
                    />
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 mt-6">
                    {editingTaxId ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={isSavingTax}
                          className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel Edit
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdateTax}
                          disabled={
                            !newTaxName.trim() ||
                            !newTaxRate.trim() ||
                            isSavingTax
                          }
                          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isSavingTax ? "Updating..." : "Update"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isSavingTax) {
                              setShowManageTaxModal(false);
                              setNewTaxName("");
                              setNewTaxRate("");
                              setNewTaxNumber("");
                              setError(null);
                              setEditingTaxId(null);
                            }
                          }}
                          disabled={isSavingTax}
                          className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddTaxType}
                          disabled={
                            !newTaxName.trim() ||
                            !newTaxRate.trim() ||
                            isSavingTax
                          }
                          className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isSavingTax ? "Saving..." : "Save"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

export default AddReceiptModal;
