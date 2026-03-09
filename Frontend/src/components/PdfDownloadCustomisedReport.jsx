// src/components/PdfDownloadCustomisedReport.jsx
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// This is a utility function, NOT a React component
// Do NOT use hooks here - it's called directly as a function
export default function PdfDownload({ receipts, groupByCategory = false, groupByMonth = false }) {
  if (!receipts || receipts.length === 0) {
    alert("No data available for PDF");
    return;
  }

  const getPaymentDisplayName = (r) => {
    let issuer = r?.card_issuer_name?.toString?.().trim?.() || null;
    let type = r?.paymentType?.toString?.().trim?.() || null;
    if (!issuer && !type) return "-";
    if (type?.toLowerCase().includes("cash")) return "Cash";
    const last4 = type?.includes("*") ? type.split("*").pop() : "";
    if (issuer) return `${issuer}${last4 ? ` *${last4}` : ""}`;
    if (type) {
      if (last4) return `*${last4}`;
      return type;
    }
    return "-";
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const d = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const getMonthYear = (timestamp) => {
    if (!timestamp) return "Unknown";
    const d = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  // Locale/currency from localStorage language, for stable 2-decimal formatting in PDFs
  const getLocaleAndCurrency = () => {
    const lang = localStorage.getItem("appLanguage") || "English";
    let locale = "en-US";
    switch (lang) {
      case "Spanish":
        locale = "es-ES";
        break;
      case "India":
        locale = "hi-IN";
        break;
      case "Canadian":
        locale = "en-CA";
        break;
      default:
        locale = "en-US";
    }
    const currencyMap = { English: "USD", Spanish: "EUR", India: "INR", Canadian: "CAD" };
    return { locale, currency: currencyMap[lang] || "USD" };
  };

  // Prefer fixed-2 formatting for PDFs for consistency, fall back to context if desired
  const formatCurrencyFixed2 = (amount) => {
    const num = Number(amount) || 0;
    const { locale, currency } = getLocaleAndCurrency();
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch (_) {
      return num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  // Choose one formatter for PDF cells: fixed-2 wins for stability
  const fmt = (v) => formatCurrencyFixed2(v);

  const doc = new jsPDF();

  const tableColumn = ["Date", "Merchant", "Category", "Payment Method", "Subtotal", "Total"];

  // Determine grouping method: month takes precedence if both are selected
  if (groupByMonth) {
    // Group receipts by month/year
    const grouped = receipts.reduce((acc, r) => {
      const monthYear = getMonthYear(r?.product_date || r?.create_date);
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(r);
      return acc;
    }, {});

    // Sort months chronologically
    const sortedMonths = Object.keys(grouped).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA - dateB;
    });

    sortedMonths.forEach((month, index) => {
      if (index !== 0) doc.addPage();

      doc.text(`Month: ${month}`, 14, 15);

      const tableRows = grouped[month].map((receipt) => [
        formatDate(receipt.product_date),
        receipt.storeName || "-",
        receipt.expense_type || "-",
        getPaymentDisplayName(receipt),
        receipt.subtotal !== undefined && !isNaN(receipt.subtotal) ? String(fmt(receipt.subtotal)) : fmt(0),
        receipt.purchasePrice !== undefined && !isNaN(receipt.purchasePrice) ? String(fmt(receipt.purchasePrice)) : fmt(0),
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 25,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185] },
      });
    });
  } else if (groupByCategory) {
    const grouped = receipts.reduce((acc, r) => {
      const cat = r?.expense_type || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    }, {});

    Object.keys(grouped).forEach((category, index) => {
      if (index !== 0) doc.addPage();

      doc.text(`Category: ${category}`, 14, 15);

      const tableRows = grouped[category].map((receipt) => [
        formatDate(receipt.product_date),
        receipt.storeName || "-",
        receipt.expense_type || "-",
        getPaymentDisplayName(receipt),
        receipt.subtotal !== undefined && !isNaN(receipt.subtotal) ? String(fmt(receipt.subtotal)) : fmt(0),
        receipt.purchasePrice !== undefined && !isNaN(receipt.purchasePrice) ? String(fmt(receipt.purchasePrice)) : fmt(0),
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 25,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185] },
      });
    });
  } else {
    doc.text("Customized Report", 14, 15);

    const tableRows = receipts.map((receipt) => [
      formatDate(receipt.product_date),
      receipt.storeName || "-",
      receipt.expense_type || "-",
      getPaymentDisplayName(receipt),
      receipt.subtotal !== undefined && !isNaN(receipt.subtotal) ? String(fmt(receipt.subtotal)) : fmt(0),
      receipt.purchasePrice !== undefined && !isNaN(receipt.purchasePrice) ? String(fmt(receipt.purchasePrice)) : fmt(0),
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185] },
    });
  }

  doc.save("report.pdf");
}
