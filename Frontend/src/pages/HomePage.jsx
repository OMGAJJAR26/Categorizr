import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { NODE_API_URL } from "../api/Axios";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useCurrency } from "../context/CurrencyContext";
import { useData } from "../context/DataContext";
import PropagateLoader from "react-spinners/PropagateLoader";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { Search, Plus, Link } from "lucide-react";
import ReceiptDetail from "./ReceiptDetail";
import FilterBar from "../components/filters/FilterBar";
import SortMenu from "../components/filters/SortMenu";
import ReportOptions from "../components/reports/ReportOptions";
import ActiveFiltersBar from "../components/ActiveFiltersBar";
import ReceiptsTable from "../components/receipts/ReceiptsTable";
import ReceiptsMobileView from "../components/receipts/ReceiptsMobileView";
import ReportModals from "../components/reports/ReportModals";
import CustomizedReportModal from "../components/receipts/CustomizedReportModal";
import AddReceiptModal from "../components/receipts/AddReceiptModal";
import DeleteConfirmationDialog from "../components/receipts/DeleteConfirmationDialog";
import Toast from "../components/Toast";
import IntegrationsModal from "../components/IntegrationsModal";
import { useReceiptFilters } from "../hooks/useReceiptFilters";
import { splitMediaField } from "../utils/mediaUrlUtils";
import { useReceiptSorting } from "../hooks/useReceiptSorting";
import { useReceiptGrouping } from "../hooks/useReceiptGrouping";
import { useReportGeneration } from "../hooks/useReportGeneration";
import { usePaymentDisplay } from "../hooks/usePaymentDisplay";
import { useChatAssistant } from "../hooks/useChatAssistant";
import ChatButton from "../components/chat/ChatButton";
import ChatPanel from "../components/chat/ChatPanel";
import RecoveryEmailVerificationFlow from "../components/RecoveryEmailVerificationFlow";
import { isTimestampFromToday } from "../components/RecoveryEmailVerificationFlow";
import "./HomePage.css";

const HomePage = () => {
  const navigate = useNavigate();
  const { refreshData, silentRefreshData, receipts, loading, updateReceiptStatus, deleteReceipt, updateReceipt, user, syncForwardedReceiptData } = useData();
  const { formatCurrency } = useCurrency();

  // Custom hooks for complex logic
  const {
    filters,
    updateFilter,
    clearFilter,
    clearAllFilters,
    activeMenu,
    setActiveMenu,
    searchTerm,
    setSearchTerm,
  } = useReceiptFilters();

  const { sortConfig, updateSort, clearSort, clearAllSort } = useReceiptSorting();

  const { draftReceipts, groupedReceipts, yearTotals, sortedYears, filteredReceipts } =
    useReceiptGrouping(receipts, filters, sortConfig, searchTerm);

  // Keep swipe order identical to visual list order:
  // Draft section first, then regular receipts grouped by year.
  const swipeOrderedReceipts = useMemo(() => {
    const orderedRegular = sortedYears.flatMap((year) => groupedReceipts[year] || []);
    const seen = new Set();
    const ordered = [];
    [...draftReceipts, ...orderedRegular].forEach((r) => {
      if (!r?.id || seen.has(r.id)) return;
      seen.add(r.id);
      ordered.push(r);
    });
    // Fallback (no grouping available yet)
    return ordered.length > 0 ? ordered : filteredReceipts;
  }, [draftReceipts, sortedYears, groupedReceipts, filteredReceipts]);

  const {
    showReportModal,
    setShowReportModal,
    reportType,
    setReportType,
    generateTaxReport,
    generateSummaryReport,
  } = useReportGeneration();

  const { getPaymentLogo, getPaymentDisplay } = usePaymentDisplay();

  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showCustomizedReport, setShowCustomizedReport] = useState(false);
  const [showAddReceiptModal, setShowAddReceiptModal] = useState(false);
  const [duplicateInitialData, setDuplicateInitialData] = useState(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState({ 
    isVisible: false, 
    message: "", 
    type: "success", 
    actionUrl: null, 
    actionLabel: null 
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
  const [quickbooksConnected, setQuickbooksConnected] = useState(false);
  const [quickbooksRealmId, setQuickbooksRealmId] = useState(null);
  const [linkingReceiptId, setLinkingReceiptId] = useState(null);
  const [linkingSageReceiptId, setLinkingSageReceiptId] = useState(null);
  const [xeroConnected, setXeroConnected] = useState(false);

  // ── Recovery-email verification popup ──
  const [showRecoveryEmailFlow, setShowRecoveryEmailFlow] = useState(false);
  const [linkingXeroReceiptId, setLinkingXeroReceiptId] = useState(null);
  const [linkedQuickbooksReceiptIds, setLinkedQuickbooksReceiptIds] = useState(() => {
    try {
      const stored = localStorage.getItem("qbLinkedReceipts");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to parse QuickBooks-linked receipts from storage:", e);
      return [];
    }
  });

  // Chat assistant hook
  const {
    messages: chatMessages,
    isLoading: isChatLoading,
    sendMessage: sendChatMessage,
    clearHistory: clearChatHistory,
  } = useChatAssistant();

  const customizedReportRef = useRef(null);
  const autoRefreshInFlightRef = useRef(false);
  const mobileSearchInputRef = useRef(null);
  const receiptsScrollRef = useRef(null);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSlider, setShowSlider] = useState(true);

  // Ref to track modal state for popstate handler
  const modalStateRef = useRef({
    showAddReceiptModal,
    showDeleteConfirmation,
    showReportModal,
    showCustomizedReport,
    isChatOpen,
    showIntegrationsModal,
    duplicateInitialData,
  });

  useEffect(() => {
    modalStateRef.current = {
      showAddReceiptModal,
      showDeleteConfirmation,
      showReportModal,
      showCustomizedReport,
      isChatOpen,
      showIntegrationsModal,
      duplicateInitialData,
    };
  });

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
  }, [navigate]);

  // ── Recovery-email verification popup ──
  // Show once per day when the user's recovery email is not yet verified.
  useEffect(() => {
    if (!user) return;

    const isVerified =
      user.isRecoveryEmailVerified ??
      user.is_recovery_email_verified ??
      false;

    if (isVerified) return;

    const ts = localStorage.getItem("cat_confirmEmailPopupTs");
    if (isTimestampFromToday(ts)) return; // already shown today

    localStorage.setItem("cat_confirmEmailPopupTs", Date.now().toString());
    setShowRecoveryEmailFlow(true);
  }, [user]);

  // Handle QuickBooks OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qb = params.get("quickbooks");
    const realmId = params.get("realmId");
    if (qb === "connected" && realmId) {
      setToast({ isVisible: true, message: "QuickBooks connected successfully!", type: "success" });
      setShowIntegrationsModal(true);
      setQuickbooksRealmId(realmId);
      setQuickbooksConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (qb === "error") {
      setToast({ isVisible: true, message: "QuickBooks connection failed. Please try again.", type: "error" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Handle Xero OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xero = params.get("xero");
    if (xero === "connected") {
      setToast({ isVisible: true, message: "Xero connected successfully!", type: "success" });
      setShowIntegrationsModal(true);
      setXeroConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (xero === "error") {
      setToast({ isVisible: true, message: "Xero connection failed. Please try again.", type: "error" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
    } catch (err) {
      console.error("Error fetching QuickBooks status:", err);
      setQuickbooksConnected(false);
      setQuickbooksRealmId(null);
    }
  };

  const fetchXeroStatus = async () => {
    try {
      const res = await fetch(`${NODE_API_URL}/api/integrations/xero/status`);
      const data = await res.json();
      if (data.success && data.connected) {
        setXeroConnected(true);
      } else {
        setXeroConnected(false);
      }
    } catch (err) {
      console.error("Error fetching Xero status:", err);
      setXeroConnected(false);
    }
  };

  useEffect(() => {
    fetchQBStatus();
    fetchXeroStatus();
  }, []);

  useEffect(() => {
    if (!showIntegrationsModal) {
      const timeoutId = setTimeout(() => {
        fetchQBStatus();
        fetchXeroStatus();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [showIntegrationsModal]);

  // Block back button
  useLayoutEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const homepagePath = window.location.pathname;
    const pushHomepage = () => window.history.pushState({ fromHomepage: true }, "", homepagePath);
    const handlePopState = () => {
      const t = localStorage.getItem("token");
      if (!t) return;
      const m = modalStateRef.current;
      
      if (m.showDeleteConfirmation) {
        setShowDeleteConfirmation(false);
        pushHomepage();
        return;
      }
      if (m.showIntegrationsModal) {
        setShowIntegrationsModal(false);
        pushHomepage();
        return;
      }
      if (m.duplicateInitialData) {
        setDuplicateInitialData(null);
        pushHomepage();
        return;
      }
      if (m.showAddReceiptModal) {
        setShowAddReceiptModal(false);
        pushHomepage();
        return;
      }
      if (m.showReportModal) {
        setShowReportModal(false);
        pushHomepage();
        return;
      }
      if (m.showCustomizedReport) {
        setShowCustomizedReport(false);
        pushHomepage();
        return;
      }
      if (m.isChatOpen) {
        setIsChatOpen(false);
        pushHomepage();
        return;
      }
      if (window.location.pathname !== homepagePath && !window.location.pathname.endsWith("/homepage")) {
        navigate("/homepage", { replace: true });
      }
      pushHomepage();
    };
    
    for (let i = 0; i < 5; i++) pushHomepage();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate]);

  // Mobile scroll effect
  useEffect(() => {
    if (loading) return;
    const scrollEl = receiptsScrollRef.current;
    const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
    const THRESHOLD = 40;

    const handleScroll = () => {
      if (!isMobile()) return;
      if (scrollEl) {
        setShowSlider(scrollEl.scrollTop <= THRESHOLD);
      }
    };

    if (scrollEl) {
      scrollEl.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => scrollEl.removeEventListener("scroll", handleScroll);
    }
    return undefined;
  }, [loading]);

  const openMobileSearch = () => {
    setShowMobileSearch(true);
    setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
  };

  const closeMobileSearch = () => setShowMobileSearch(false);

  // Auto-refresh receipts so incoming eReceipts appear without manual refresh/login cycle.
  // Uses silent refresh to avoid full-page loading flicker.
  useEffect(() => {
    if (!user?.id) return;

    let stopped = false;
    const runSilentAutoRefresh = async () => {
      if (stopped || document.hidden || autoRefreshInFlightRef.current) return;
      autoRefreshInFlightRef.current = true;
      try {
        await silentRefreshData(0);
      } catch (e) {
        // Keep this non-blocking; regular manual refresh still works.
        console.error("Auto refresh failed:", e);
      } finally {
        autoRefreshInFlightRef.current = false;
      }
    };

    // Refresh whenever tab becomes active again.
    const handleVisibilityOrFocus = () => {
      runSilentAutoRefresh();
    };

    const intervalId = window.setInterval(runSilentAutoRefresh, 15000);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [user?.id, silentRefreshData]);

  // Detect newly-arrived forwarded receipts: show notification + sync missing data.
  useEffect(() => {
    if (!receipts || !user?.id) return;

    // ── Notification tracking (seen = already notified) ──
    const notifKey = `cat_seen_forwards_${user.id}`;
    let seen;
    try {
      seen = new Set(JSON.parse(localStorage.getItem(notifKey) || "[]"));
    } catch {
      seen = new Set();
    }

    // ── Sync tracking (separate key — existing receipts may not have been synced yet) ──
    const syncKey = `cat_synced_forwards_${user.id}`;
    let synced;
    try {
      synced = new Set(JSON.parse(localStorage.getItem(syncKey) || "[]"));
    } catch {
      synced = new Set();
    }

    const allForwards = receipts.filter((r) => {
      const fwdId = r.fk_forward_from_receipt_id;
      return fwdId && fwdId !== "0" && fwdId !== 0;
    });

    // Receipts that haven't shown a notification yet
    const newForwards = allForwards.filter((r) => !seen.has(String(r.id)));
    // Receipts that haven't been data-synced yet (may include older forwards)
    const toSync = allForwards.filter((r) => !synced.has(String(r.id)));

    // Show notification for newly arrived ones
    if (newForwards.length > 0) {
      newForwards.forEach((r) => seen.add(String(r.id)));
      try { localStorage.setItem(notifKey, JSON.stringify([...seen])); } catch { /* quota */ }

      const latest = newForwards[newForwards.length - 1];
      const senderName = latest.originalUsername || null;
      const count = newForwards.length;
      let message;
      if (count === 1) {
        message = senderName
          ? `New eReceipt forwarded from ${senderName}`
          : "New eReceipt forwarded to you";
      } else {
        const names = [...new Set(newForwards.map((r) => r.originalUsername).filter(Boolean))];
        message = names.length > 0
          ? `${count} new eReceipts forwarded from ${names.join(", ")}`
          : `${count} new eReceipts forwarded to you`;
      }
      setToast({ isVisible: true, message, type: "info", actionUrl: null, actionLabel: null });
    }

    // Auto-add missing merchant / payment method / expense category / tax types
    // for ALL unsynced forwarded receipts (including ones that arrived before this feature)
    if (syncForwardedReceiptData && toSync.length > 0) {
      // Mark upfront to prevent concurrent duplicate syncs on rapid re-renders.
      // On failure, unmark so the next receipts refresh can retry.
      toSync.forEach((r) => synced.add(String(r.id)));
      try { localStorage.setItem(syncKey, JSON.stringify([...synced])); } catch { /* quota */ }
      toSync.forEach((r) => {
        syncForwardedReceiptData(r).catch(() => {
          synced.delete(String(r.id));
          try { localStorage.setItem(syncKey, JSON.stringify([...synced])); } catch { /* quota */ }
        });
      });
    }
  }, [receipts, user?.id, syncForwardedReceiptData]);

  const handleReceiptClick = async (receipt, index) => {
    if (receipt.status === "0") {
      await updateReceiptStatus(receipt.id, "1");
    }
    const fresh =
      receipts.find((r) => String(r.id) === String(receipt.id)) || receipt;
    setSelectedReceipt(fresh);
    setSelectedIndex(index);
  };

  const handleCloseReceiptDetail = () => {
    setSelectedReceipt(null);
    setSelectedIndex(null);
  };

  const handleCreateReport = (type) => {
    setReportType(type);
    setShowReportModal(true);
  };

  const handleApplyTaxTypes = (list) => {
    updateFilter("taxTypes", list);
  };

  const handleReceiptAdded = () => {
    // Use silentRefreshData so the receipt list stays visible while re-fetching.
    // A 1.5s delay gives the server time to commit the new receipt before we re-query.
    silentRefreshData(1500);
    setToast({ isVisible: true, message: "Saved successfully!", type: "success" });
  };

  /**
   * Called by AddReceiptModal after the original receipt is saved.
   * Closes the current modal and immediately opens a fresh one pre-filled
   * with the duplicate snapshot so the user can edit and save as a new receipt.
   */
  const handleDuplicate = (snapshot) => {
    setShowAddReceiptModal(false);          // close the "original" modal
    setDuplicateInitialData(snapshot);      // triggers the duplicate modal to open
    setToast({
      isVisible: true,
      message: "Your original receipt has been saved successfully. You are now viewing the duplicate receipt.",
      type: "success",
    });
  };

  const handleDeleteClick = (receipt) => {
    setReceiptToDelete(receipt);
    setShowDeleteConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (!receiptToDelete) return;

    setIsDeleting(true);
    try {
      const success = await deleteReceipt(receiptToDelete.id);
      if (success) {
        setShowDeleteConfirmation(false);
        setReceiptToDelete(null);
        if (selectedReceipt?.id === receiptToDelete.id) {
          handleCloseReceiptDetail();
        }
        setToast({ isVisible: true, message: "Receipt deleted successfully", type: "success" });
      } else {
        setToast({ isVisible: true, message: "Failed to delete receipt. Please try again.", type: "error" });
      }
    } catch (error) {
      console.error("Error deleting receipt:", error);
      setToast({ isVisible: true, message: "Error deleting receipt. Please try again.", type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false);
    setReceiptToDelete(null);
  };

  const getReceiptImageUrl = (receipt) => {
    const candidates = [
      receipt.receipt_image,
      receipt.emailAttachment,
      receipt.receiptImage,
      receipt.email_attachment,
      receipt.emailattachment,
      receipt.receiptimage,
    ];

    for (const url of candidates) {
      if (!url || typeof url !== "string") continue;
      const mediaUrls = splitMediaField(url);
      const trimmed = (mediaUrls[0] || url).trim();
      
      if (!trimmed || ["0", "null", "@", "undefined", ""].includes(trimmed.toLowerCase())) {
        continue;
      }

      const invalidPatterns = [
        "android.resource://",
        "content://",
        "file://",
        "resource://",
      ];
      if (invalidPatterns.some((p) => trimmed.startsWith(p))) {
        continue;
      }

      if (trimmed.startsWith("/") || (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:"))) {
        if (trimmed.startsWith("/9j/") || /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 100))) {
          return trimmed.startsWith("data:") ? trimmed : `data:image/jpeg;base64,${trimmed}`;
        }
        if (trimmed.startsWith("/")) {
          return `https://categorizr.com${trimmed}`;
        }
        return `https://categorizr.com/emailserver/${trimmed}`;
      }

      return trimmed;
    }

    return null;
  };

  // Helper: mark a receipt as QB-linked in local state + localStorage
  const markQbLinked = (receiptId) => {
    if (receiptId == null) return;
    const idStr = receiptId.toString();
    setLinkedQuickbooksReceiptIds((prev) => {
      if (prev.includes(idStr)) return prev;
      const next = [...prev, idStr];
      try {
        localStorage.setItem("qbLinkedReceipts", JSON.stringify(next));
      } catch (e) {
        console.error("Failed to persist QB-linked receipts:", e);
      }
      return next;
    });
  };

  const handleLinkToQuickBooks = async (receipt) => {
    const receiptIdStr = (receipt.id ?? "").toString();

    if (receipt.quickbooksLinked || linkedQuickbooksReceiptIds.includes(receiptIdStr)) {
      setToast({
        isVisible: true,
        message: "This receipt is already linked to QuickBooks.",
        type: "success",
        actionUrl: null,
        actionLabel: null,
      });
      return;
    }

    const imageUrl = getReceiptImageUrl(receipt);
    setLinkingReceiptId(receipt.id);
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${NODE_API_URL}/api/integrations/quickbooks/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token || "",
        },
        body: JSON.stringify({
          realmId: quickbooksRealmId,
          receiptId: receipt.id,
          storeName: receipt.storeName || receipt.merchant || "",
          purchasePrice: receipt.purchasePrice || receipt.total_amount || "",
          product_date: receipt.product_date || "",
          expense_type: receipt.expense_type || "",
          product_name: receipt.product_name || "",
          receipt_category: receipt.receipt_category || "",
          payment_method: receipt.paymentMethod || receipt.payment_method || "",
          card_number: receipt.last_4_digit_card || receipt.last4Digits || "",
          subtotal: receipt.subtotal || "",
          receipt_tax_values: receipt.receipt_tax_values || [],
          tip: receipt.tip || "",
          notes: receipt.notes || "",
          receipt_image: imageUrl,
          emailAttachment: imageUrl,
          receiptFileName: `receipt_${receipt.id || Date.now()}.jpg`,
        }),
      });
      
      const status = res.status;
      let responseText;
      
      try {
        responseText = await res.text();
      } catch (readErr) {
        console.error("Failed to read response:", readErr);
        setToast({ 
          isVisible: true, 
          message: "Failed to read response from server.", 
          type: "error",
          actionUrl: null,
          actionLabel: null
        });
        return;
      }
      
      if (!responseText || responseText.trim().length === 0) {
        setToast({
          isVisible: true,
          message: "Receipt linked to QuickBooks successfully!",
          type: "success",
          actionUrl: null,
          actionLabel: null
        });
        markQbLinked(receipt.id);
        refreshData();
        return;
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        if (status === 200) {
          setToast({
            isVisible: true,
            message: "Receipt linked to QuickBooks successfully!",
            type: "success",
            actionUrl: null,
            actionLabel: null
          });
          markQbLinked(receipt.id);
          refreshData();
          return;
        }
        setToast({ 
          isVisible: true, 
          message: "Invalid JSON response from server. Please check console for details.", 
          type: "error",
          actionUrl: null,
          actionLabel: null
        });
        return;
      }
      
      const hasError = !!data.error;
      let isSuccess = false;
      
      if (status === 200) {
        if (hasError && typeof data.error === 'string' && data.error.length > 0) {
          isSuccess = false;
        } else {
          isSuccess = true;
        }
      } else {
        isSuccess = false;
      }
      
      if (isSuccess) {
        let message = data.message || "Receipt linked to QuickBooks successfully!";
        if (data.instructions) message += ` ${data.instructions}`;
        if (data.warning) message += ` ${data.warning}`;
        else if (data.note) message += ` ${data.note}`;

        setToast({
          isVisible: true,
          message,
          type: "success",
          actionUrl: data.quickbooksUrl || null,
          actionLabel: data.quickbooksUrl ? "Open QuickBooks Expenses" : null,
        });
        markQbLinked(receipt.id);
        refreshData();
      } else {
        let errorMessage = data.error || data.message || `Failed to link receipt to QuickBooks (HTTP ${status}).`;
        
        if (data.details) {
          console.error("QuickBooks integration error details:", data.details);
        }
        
        setToast({ 
          isVisible: true, 
          message: errorMessage, 
          type: "error",
          actionUrl: null,
          actionLabel: null
        });
      }
    } catch (err) {
      console.error("QuickBooks link error:", err);
      let errorMessage = "Failed to link receipt. Please try again.";
      if (err.message) {
        errorMessage += ` Error: ${err.message}`;
      }
      setToast({ 
        isVisible: true, 
        message: errorMessage, 
        type: "error",
        actionUrl: null,
        actionLabel: null
      });
    } finally {
      setLinkingReceiptId(null);
    }
  };

  const handleLinkToXero = async (receipt) => {
    const imageUrl = getReceiptImageUrl(receipt);
    setLinkingXeroReceiptId(receipt.id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${NODE_API_URL}/api/integrations/xero/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token || "",
        },
        body: JSON.stringify({
          receiptId: receipt.id,
          storeName: receipt.storeName || receipt.merchant || "",
          purchasePrice: receipt.purchasePrice || receipt.total_amount || "",
          product_date: receipt.product_date || "",
          expense_type: receipt.expense_type || "",
          product_name: receipt.product_name || "",
          payment_method: receipt.paymentMethod || receipt.payment_method || "",
          card_number: receipt.last_4_digit_card || receipt.last4Digits || "",
          subtotal: receipt.subtotal || "",
          receipt_tax_values: receipt.receipt_tax_values || [],
          tip: receipt.tip || "",
          notes: receipt.notes || "",
          receipt_image: imageUrl || "",
          emailAttachment: imageUrl || "",
          receiptFileName: `receipt_${receipt.id || Date.now()}.jpg`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({
          isVisible: true,
          message: data.message || "Receipt sent to Xero as a Bill successfully!",
          type: "success",
          actionUrl: data.xeroUrl || null,
          actionLabel: data.xeroUrl ? "View in Xero Bills" : null,
        });
      } else {
        setToast({
          isVisible: true,
          message: data.error || "Failed to send receipt to Xero.",
          type: "error",
          actionUrl: null,
          actionLabel: null,
        });
      }
    } catch (err) {
      console.error("Xero link error:", err);
      setToast({
        isVisible: true,
        message: "Failed to send receipt to Xero. Please try again.",
        type: "error",
        actionUrl: null,
        actionLabel: null,
      });
    } finally {
      setLinkingXeroReceiptId(null);
    }
  };

  const handleLinkToSage = async (receipt) => {
    const imageUrl = getReceiptImageUrl(receipt);
    setLinkingSageReceiptId(receipt.id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${NODE_API_URL}/api/integrations/sage-bc/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token || "",
        },
        body: JSON.stringify({
          receiptId: receipt.id,
          storeName: receipt.storeName || receipt.merchant || "",
          purchasePrice: receipt.purchasePrice || receipt.total_amount || "",
          product_date: receipt.product_date || "",
          expense_type: receipt.expense_type || "",
          product_name: receipt.product_name || "",
          notes: receipt.notes || "",
          receipt_image: imageUrl || "",
          emailAttachment: imageUrl || "",
          receiptFileName: `receipt_${receipt.id || Date.now()}.jpg`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({
          isVisible: true,
          message: data.message || "Receipt sent to Sage.",
          type: "success",
          actionUrl: data.sageUrl || null,
          actionLabel: data.sageUrl ? "Open Sage" : null,
        });
      } else {
        setToast({
          isVisible: true,
          message: data.error || "Failed to send receipt to Sage.",
          type: "error",
          actionUrl: null,
          actionLabel: null,
        });
      }
    } catch (err) {
      console.error("Sage link error:", err);
      setToast({
        isVisible: true,
        message: "Failed to send receipt to Sage. Please try again.",
        type: "error",
        actionUrl: null,
        actionLabel: null,
      });
    } finally {
      setLinkingSageReceiptId(null);
    }
  };

  const handleRemoveFilter = (key) => {
    if (key === "sortOrder") {
      clearSort("order");
    } else if (key === "sortDate") {
      clearSort("date");
    } else if (key === "sortAmount") {
      clearSort("amount");
    } else {
      clearFilter(key);
    }
    setActiveMenu(null);
  };

  const handleClearAll = () => {
    clearAllFilters();
    clearAllSort();
    setActiveMenu(null);
  };

  const sliderContent = [
    "Track Expenses",
    "Organize Receipts",
    "Visual Reports",
    "Maximize Tax Deductions",
    "Create Reports",
  ];

  return (
    <div className="home-page">
      <Header />

      {loading ? (
        <div className="home-loader-wrap">
          <PropagateLoader color="#2563eb" size={15} />
        </div>
      ) : (
        <>
          <div className={`home-hero ${!showSlider ? "home-hero-mobile-hidden" : ""}`}>
            <Slider
              dots={false}
              infinite
              speed={700}
              autoplay
              autoplaySpeed={3000}
              slidesToShow={1}
              slidesToScroll={1}
              arrows={false}
            >
              {sliderContent.map((title, index) => (
                <div key={index} className="home-hero-slide">
                  <h1 className="home-hero-title">{title}</h1>
                  <p className="home-hero-subtitle">AI-Powered Tools</p>
                </div>
              ))}
            </Slider>
          </div>

          <div className="home-main-card">
            <div className="sticky top-[70px] sm:top-[78px] lg:top-[90px] bg-white z-40 pb-1 sm:pb-1">
              <div className="md:hidden home-sticky-bar-mobile">
                <div className="flex items-center flex-nowrap min-h-0 w-full justify-between gap-0.5 home-mobile-icon-row">
                  <button
                    onClick={() => setShowAddReceiptModal(true)}
                    className="home-add-receipt-btn home-mobile-icon-btn"
                    title="Add Receipt"
                  >
                    <Plus size={18} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    onClick={openMobileSearch}
                    className="home-mobile-search-icon-btn"
                    title="Search"
                  >
                    <Search size={18} strokeWidth={2.2} />
                  </button>
                  <ReportOptions
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    onSelectReport={handleCreateReport}
                    onApplyTaxTypes={handleApplyTaxTypes}
                    selectedTaxAndTipsTypes={filters.taxTypes}
                    setShowCustomizedReport={setShowCustomizedReport}
                    iconOnly
                  />
                  <FilterBar
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    filters={filters}
                    updateFilter={updateFilter}
                    iconOnly
                  />
                  <SortMenu
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    sortConfig={sortConfig}
                    updateSort={updateSort}
                    iconOnly
                  />
                  <button
                    type="button"
                    onClick={() => setShowIntegrationsModal(true)}
                    className="home-integrations-btn home-mobile-icon-btn"
                    title="Accounting integrations"
                  >
                    <Link size={18} strokeWidth={2.6} />
                  </button>
                </div>
                {showMobileSearch && (
                  <div className="relative w-full home-search-wrap mt-1">
                    <input
                      ref={mobileSearchInputRef}
                      type="text"
                      placeholder="Search transactions"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onBlur={closeMobileSearch}
                      className="home-search-input"
                    />
                    <Search
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={16}
                    />
                  </div>
                )}
              </div>

              <div className="hidden md:flex home-sticky-bar-desktop justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="home-section-title">Receipts</h2>
                  <button
                    onClick={() => setShowAddReceiptModal(true)}
                    className="home-add-receipt-btn-desktop"
                  >
                    <Plus size={18} strokeWidth={3} />
                    <span>Add Receipt</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 relative">
                  <FilterBar
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    filters={filters}
                    updateFilter={updateFilter}
                  />

                  <SortMenu
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    sortConfig={sortConfig}
                    updateSort={updateSort}
                  />

                  <div className="relative hidden lg:block">
                    <input
                      type="text"
                      placeholder="Search transactions"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="home-search-input w-[200px] xl:w-[240px]"
                    />
                    <Search
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={16}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <ReportOptions
                      activeMenu={activeMenu}
                      setActiveMenu={setActiveMenu}
                      onSelectReport={handleCreateReport}
                      onApplyTaxTypes={handleApplyTaxTypes}
                      selectedTaxAndTipsTypes={filters.taxTypes}
                      setShowCustomizedReport={setShowCustomizedReport}
                    />

                    <button
                      type="button"
                      onClick={() => setShowIntegrationsModal(true)}
                      className="home-integrations-btn"
                      title="Accounting integrations"
                    >
                      <Link size={18} strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
              </div>

              <ActiveFiltersBar
                filters={filters}
                sortConfig={sortConfig}
                searchTerm={searchTerm}
                onRemoveFilter={handleRemoveFilter}
                onClearAll={handleClearAll}
              />

              <div className="hidden lg:grid home-table-header">
                <div>Date</div>
                <div>Type</div>
                <div>Merchant</div>
                <div>Category</div>
                <div>Description</div>
                <div>Payment Method</div>
                <div className="text-right">Total</div>
                <div className="text-center">Actions</div>
              </div>
            </div>

            <div ref={receiptsScrollRef} className="max-h-[calc(100vh-200px)] overflow-y-auto">

              {/* ── Draft / To Be Verified receipts ── */}
              {draftReceipts.length > 0 && (
                <div className="mb-4">
                  <div className="home-year-header bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                    <span className="text-amber-700 font-bold">
                      Draft Receipts ({draftReceipts.length}{" "}
                      {draftReceipts.length === 1 ? "Receipt" : "Receipts"})
                    </span>
                    <span className="text-amber-700 font-bold">
                      TOTAL: {formatCurrency(
                        draftReceipts.reduce((sum, r) => sum + (parseFloat(r.purchasePrice) || 0), 0)
                      )}
                    </span>
                  </div>
                  <div className="home-receipts-inner">
                    {draftReceipts.map((receipt, index) => (
                      <div key={receipt.id || index} className="mb-3">
                        <ReceiptsTable
                          receipt={receipt}
                          getPaymentLogo={getPaymentLogo}
                          getPaymentDisplay={getPaymentDisplay}
                          onViewClick={() => handleReceiptClick(receipt, index)}
                          onDeleteClick={handleDeleteClick}
                          onLinkToQuickBooks={quickbooksConnected ? () => handleLinkToQuickBooks(receipt) : undefined}
                          quickbooksConnected={quickbooksConnected}
                          onLinkToSage={() => handleLinkToSage(receipt)}
                          onLinkToXero={xeroConnected ? () => handleLinkToXero(receipt) : undefined}
                          isLinking={linkingReceiptId === receipt.id}
                          isLinkingSage={linkingSageReceiptId === receipt.id}
                          isLinkingXero={linkingXeroReceiptId === receipt.id}
                          formatCurrency={formatCurrency}
                          isToBeVerified={true}
                          disableDelete={true}
                        />
                        <ReceiptsMobileView
                          receipt={receipt}
                          getPaymentLogo={getPaymentLogo}
                          getPaymentDisplay={getPaymentDisplay}
                          onViewClick={() => handleReceiptClick(receipt, index)}
                          onDeleteClick={handleDeleteClick}
                          onLinkToQuickBooks={quickbooksConnected ? () => handleLinkToQuickBooks(receipt) : undefined}
                          quickbooksConnected={quickbooksConnected}
                          onLinkToSage={() => handleLinkToSage(receipt)}
                          onLinkToXero={xeroConnected ? () => handleLinkToXero(receipt) : undefined}
                          isLinking={linkingReceiptId === receipt.id}
                          isLinkingSage={linkingSageReceiptId === receipt.id}
                          isLinkingXero={linkingXeroReceiptId === receipt.id}
                          formatCurrency={formatCurrency}
                          isToBeVerified={true}
                          disableDelete={true}
                        />
                        {selectedReceipt?.id === receipt.id && (
                          <ReceiptDetail
                            receipt={selectedReceipt}
                            receiptList={swipeOrderedReceipts}
                            reversedSwipe={true}
                            selectedIndex={selectedIndex}
                            setSelectedIndex={setSelectedIndex}
                            onSelectReceipt={handleReceiptClick}
                            onClose={handleCloseReceiptDetail}
                            onSaved={() => setToast({ isVisible: true, message: "Receipt updated!", type: "success" })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sortedYears.map((year) => {
                const yearReceipts = groupedReceipts[year] || [];
                if (!yearReceipts.length) return null;

                const yearTotal = yearTotals[year];

                return (
                  <div key={year}>
                    <div className="home-year-header">
                      <span>
                        {year} ({yearReceipts.length} Receipts)
                      </span>
                      <span className="home-year-total sm:mr-[196px]">
                        TOTAL: {formatCurrency(yearTotal)}
                      </span>
                    </div>

                    <div className="home-receipts-inner">
                      {yearReceipts.map((receipt, index) => (
                        <div key={receipt.id || index} className="mb-3">
                          <ReceiptsTable
                            receipt={receipt}
                            getPaymentLogo={getPaymentLogo}
                            getPaymentDisplay={getPaymentDisplay}
                            onViewClick={() => handleReceiptClick(receipt, index)}
                            onDeleteClick={handleDeleteClick}
                            onLinkToQuickBooks={quickbooksConnected ? () => handleLinkToQuickBooks(receipt) : undefined}
                            quickbooksConnected={quickbooksConnected}
                            onLinkToSage={() => handleLinkToSage(receipt)}
                            onLinkToXero={xeroConnected ? () => handleLinkToXero(receipt) : undefined}
                            isLinking={linkingReceiptId === receipt.id}
                            isLinkingSage={linkingSageReceiptId === receipt.id}
                            isLinkingXero={linkingXeroReceiptId === receipt.id}
                            formatCurrency={formatCurrency}
                          />

                          <ReceiptsMobileView
                            receipt={receipt}
                            getPaymentLogo={getPaymentLogo}
                            getPaymentDisplay={getPaymentDisplay}
                            onViewClick={() => handleReceiptClick(receipt, index)}
                            onDeleteClick={handleDeleteClick}
                            onLinkToQuickBooks={quickbooksConnected ? () => handleLinkToQuickBooks(receipt) : undefined}
                            quickbooksConnected={quickbooksConnected}
                            onLinkToSage={() => handleLinkToSage(receipt)}
                            onLinkToXero={xeroConnected ? () => handleLinkToXero(receipt) : undefined}
                            isLinking={linkingReceiptId === receipt.id}
                            isLinkingSage={linkingSageReceiptId === receipt.id}
                            isLinkingXero={linkingXeroReceiptId === receipt.id}
                            formatCurrency={formatCurrency}
                          />

                          {selectedReceipt?.id === receipt.id && (
                            <>
                              <ReceiptDetail
                                receipt={selectedReceipt}
                                receiptList={swipeOrderedReceipts}
                                selectedIndex={selectedIndex}
                                setSelectedIndex={setSelectedIndex}
                                onSelectReceipt={handleReceiptClick}
                                onClose={handleCloseReceiptDetail}
                                onSaved={() => setToast({ isVisible: true, message: "Receipt updated!", type: "success" })}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {sortedYears.length === 0 && (
                <div className="home-empty-state">
                  No receipts found matching your filters
                </div>
              )}
            </div>
          </div>

          <ReportModals
            showReportModal={showReportModal}
            reportType={reportType}
            setShowReportModal={setShowReportModal}
            filters={filters}
            sortConfig={sortConfig}
            searchTerm={searchTerm}
            filteredReceipts={filteredReceipts}
            generateTaxReport={generateTaxReport}
            generateSummaryReport={generateSummaryReport}
            formatCurrencyFixed2={formatCurrency}
            onApplyTaxTypes={handleApplyTaxTypes}
          />

          <IntegrationsModal
            open={showIntegrationsModal}
            onClose={() => setShowIntegrationsModal(false)}
          />

          {showCustomizedReport && (
            <CustomizedReportModal
              onClose={() => setShowCustomizedReport(false)}
              ref={customizedReportRef}
              receipts={receipts}
            />
          )}

          {showAddReceiptModal && (
            <AddReceiptModal
              key="add-receipt"
              onClose={() => setShowAddReceiptModal(false)}
              onReceiptAdded={handleReceiptAdded}
              onDuplicate={handleDuplicate}
            />
          )}

          {/* Duplicate receipt modal — fresh mount with all original data pre-filled */}
          {duplicateInitialData && (
            <AddReceiptModal
              key="duplicate-receipt"
              initialData={duplicateInitialData}
              onClose={() => setDuplicateInitialData(null)}
              onReceiptAdded={() => {
                setDuplicateInitialData(null);
                handleReceiptAdded();
              }}
              onDuplicate={handleDuplicate}
            />
          )}

          <DeleteConfirmationDialog
            isOpen={showDeleteConfirmation}
            onClose={handleCancelDelete}
            onConfirm={handleConfirmDelete}
            isDeleting={isDeleting}
          />

          <Toast
            message={toast.message}
            type={toast.type}
            isVisible={toast.isVisible}
            actionUrl={toast.actionUrl}
            actionLabel={toast.actionLabel}
            onClose={() => setToast({ ...toast, isVisible: false })}
          />

          {!isChatOpen && (
            <ChatButton
              onClick={() => setIsChatOpen(true)}
              hasUnread={false}
            />
          )}

          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={chatMessages}
            isLoading={isChatLoading}
            onSendMessage={sendChatMessage}
            onClearHistory={clearChatHistory}
            onReceiptClick={(receipt) => {
              const index = receipts.findIndex((r) => r.id === receipt.id);
              handleReceiptClick(receipt, index >= 0 ? index : 0);
              setIsChatOpen(false);
            }}
          />
        </>
      )}

      {/* ── Recovery-email OTP verification popup ── */}
      {showRecoveryEmailFlow && (
        <RecoveryEmailVerificationFlow
          onDone={(verified) => {
            setShowRecoveryEmailFlow(false);
            if (verified) {
              setToast({
                isVisible: true,
                message: "Email verified successfully!",
                type: "success",
                actionUrl: null,
                actionLabel: null,
              });
            }
          }}
        />
      )}
    </div>
  );
};

export default HomePage;