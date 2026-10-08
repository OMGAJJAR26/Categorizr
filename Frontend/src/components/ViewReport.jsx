import { useEffect, useRef, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { usePaymentDisplay } from "../hooks/usePaymentDisplay";
import { formatTaxRate } from "../utils/receiptFormatters";
import { getPdfProxyUrl, splitMediaField, isPdfUrl } from "../utils/mediaUrlUtils";
import SimpleAlertModal from "./SimpleAlertModal";

const ViewReport = ({ receipt, onClose, reportWindow }) => {
  const { currency, language } = useCurrency();
  const { getDetailedPaymentDisplay } = usePaymentDisplay();
  const hasRun = useRef(false);
  const [alertMsg, setAlertMsg] = useState(null);

  useEffect(() => {
    if (!receipt || !onClose || hasRun.current) return;

    hasRun.current = true;

    const newTab =
      reportWindow && !reportWindow.closed ? reportWindow : window.open("", "_blank");
    if (newTab && newTab.document) {
      try {
        newTab.document.open();
        newTab.document.write(htmlContent);
        newTab.document.close();
        onClose();
      } catch (error) {
        console.error("Error writing document:", error);
        newTab.close();
        setAlertMsg("Failed to generate report. Please try again.");
      }
    } else {
      setAlertMsg("Allow pop-ups to view the report, then try again.");
    }

    return () => {};
  }, [receipt, onClose, reportWindow]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp) * 1000);
    // product_date is anchored to UTC noon; render in UTC so the calendar day
    // never shifts by the viewer's local timezone (matches the main receipt UI).
    return date.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getLocaleForLanguage = (lang) => {
    switch ((lang || "").toString()) {
      case "Spanish":
        return "es-ES";
      case "India":
        return "hi-IN";
      case "Canadian":
        return "en-CA";
      default:
        return "en-US";
    }
  };

  const formatCurrencyFixed2 = (amount) => {
    const num = Number(amount) || 0;
    const locale = getLocaleForLanguage(language);
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch (_) {
      return num.toLocaleString(locale, {
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

  const paymentDisplayName = getDetailedPaymentDisplay(receipt);

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const taxRowsHtml = nonTipTaxes
    .map((t) => {
      const rateNum =
        t?.tax_rate !== undefined && t?.tax_rate !== null
          ? parseFloat(String(t.tax_rate).replace(/%/g, ""))
          : 0;
      const rateStr = `${formatTaxRate(isNaN(rateNum) ? 0 : rateNum)}%`;
      const amt = Number(t?.tax_amount) || 0;
      const name = esc((t?.tax_name || "Tax").toString());
      return `
        <div class="total-row">
          <span>${name} (${rateStr})</span>
          <span>${formatCurrencyFixed2(amt)}</span>
        </div>
      `;
    })
    .join("");

  // Fixed tip percentage calculation
  const tipsRowHtml = tipTax
    ? (() => {
        const tipAmount = Number(tipTax?.tax_amount) || 0;
        const subtotal = Number(receipt.subtotal || receipt.purchasePrice || 0);
        
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

  // Add proxy for non-HTTPS PDF URLs
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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt Report - ${esc(receipt.storeName || "Merchant")}</title>
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
          .toolbar { 
            position: sticky;
            top: 0;
            z-index: 1000; 
            background: #fff; 
            border-bottom: 1px solid #e5e7eb; 
            padding: 12px 20px;
            display: flex;
            justify-content: center;
            gap: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .btn { 
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #fff;
            color: #333;
            border: 1px solid #d1d5db;
            border-radius: 6px; 
            padding: 8px 14px; 
            cursor: pointer; 
            font-size: 14px; 
            font-weight: 500;
            transition: all 0.2s;
          }
          .btn:hover {
            background: #f9fafb;
            border-color: #9ca3af;
          }
          .btn svg {
            width: 16px;
            height: 16px;
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
            overflow: visible;
            background: #fff;
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
            display: table;
            width: 100%;
            padding: 0;
            border-bottom: 1px solid #f3f4f6; 
          }
          .row:last-child { border-bottom: none; }
          .label { 
            display: table-cell;
            width: 180px;
            padding: 10px 16px;
            font-weight: 500;
            color: #4b5563;
            vertical-align: top;
          }
          .value { 
            display: table-cell;
            padding: 10px 16px;
            color: #111827;
            vertical-align: top;
          }
          .total-row { 
            display: table;
            width: 100%;
            padding: 0;
          }
          .total-row span {
            display: table-cell;
            padding: 10px 16px;
          }
          .total-row span:last-child {
            text-align: right;
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
            overflow: visible;
            background: #fff;
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
          
          /* Print styles */
          @media print {
            @page {
              margin: 10mm;
            }
            .toolbar {
              display: none !important;
              visibility: hidden !important;
            }
            body {
              margin: 0 !important;
              padding: 10px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .btn {
              display: none !important;
              visibility: hidden !important;
            }
            .receipt-image-container {
              page-break-inside: avoid;
            }
          }

          /* PDF generation styles */
          .section {
            page-break-inside: avoid;
          }
          .total-row {
            page-break-inside: avoid;
          }
          .receipt-image-section {
            page-break-inside: avoid;
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button id="btn-download" class="btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </button>
          <button id="btn-print" class="btn" onclick="window.print()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print
          </button>
          <button id="btn-email" class="btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            Email
          </button>
          <button id="btn-close" class="btn" onclick="window.close()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Close
          </button>
        </div>
        
        <div class="container">
          <div class="header">
            <div class="merchant">${esc(receipt.storeName || "MERCHANT NAME")}</div>
            <div class="date">${formatDate(receipt.product_date)}</div>
          </div>

          <div class="section">
            <div class="section-title">RECEIPT INFORMATION</div>
            <div class="row">
              <div class="label">Date</div>
              <div class="value">${formatDate(receipt.product_date) || "—"}</div>
            </div>
            <div class="row">
              <div class="label">Expense Type</div>
              <div class="value">${categoryLabel}</div>
            </div>
            <div class="row">
              <div class="label">Merchant</div>
              <div class="value">${esc(receipt.storeName || "—")}</div>
            </div>
            <div class="row">
              <div class="label">Expense Category</div>
              <div class="value">${esc(receipt.expense_type || "—")}</div>
            </div>
            <div class="row">
              <div class="label">Payment</div>
              <div class="value">${esc(paymentDisplayName)}</div>
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
              <span>${formatCurrencyFixed2(receipt.purchasePrice || 0)}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">MORE INFORMATION</div>
            <div class="row">
              <div class="label">Describe Purchase</div>
              <div class="value">${esc(receipt.product_name || "")}</div>
            </div>
            <div class="row">
              <div class="label">Notes</div>
              <div class="value">${esc(receipt.notes || "")}</div>
            </div>
          </div>

          <!-- Tags Selected Section -->
          <div class="section">
            <div class="section-title">TAGS SELECTED</div>
            ${(() => {
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

              return '<div class="row"><div class="value"><div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">' +
                     activeTags.map((tag) => 
                       '<div style="background: #f0f9ff; border: 1px solid #007bff; border-radius: 16px; padding: 4px 12px; font-size: 12px; color: #007bff; font-weight: 500;">' +
                       tag +
                       '</div>'
                     ).join('') +
                     '</div></div></div>';
            })()}
          </div>

          <!-- Linked to Inventory -->
          <div class="section">
            <div class="row w-auto me-4">
              <div class="label">Linked to Inventory</div>
              <div class="value">${receipt.isLinkedToInventory ? "Yes" : "No"}</div>
            </div>
          </div>

          <!-- Receipt Image/PDF Section - Always show image/PDF -->
          <div class="receipt-image-section">
            <div class="section-title">RECEIPT IMAGE</div>
            <div class="receipt-image-container">
              ${
                finalPdfUrl
                  ? isPdfAttachment
                    ? `<iframe src="${finalPdfUrl}" class="pdf-viewer" title="Receipt PDF"></iframe>`
                    : `<img src="${finalPdfUrl}" class="receipt-image" alt="Receipt" onerror="this.onerror=null; this.src=''; this.parentNode.innerHTML='<div class=\\'image-notice\\'>Receipt image could not be loaded</div>';" />`
                  : '<div class="image-notice">No receipt image available</div>'
              }
            </div>
          </div>
        </div>

        <script>
          (function() {
            function emailReceipt() {
              const subject = ${JSON.stringify(`Receipt Report from ${receipt.storeName || ""}`).replace(/</g, "\\u003c")};
              const body = ${JSON.stringify(
                [
                  "Receipt Details:",
                  "",
                  `Date: ${formatDate(receipt.product_date) || "-"}`,
                  `Merchant: ${receipt.storeName || "-"}`,
                  `Expense Type: ${categoryLabel}`,
                  `Expense Category: ${receipt.expense_type || "-"}`,
                  `Payment: ${paymentDisplayName || "-"}`,
                  `Subtotal: ${formatCurrencyFixed2(receipt.subtotal || 0)}`,
                  `Total: ${formatCurrencyFixed2(receipt.purchasePrice || 0)}`,
                  `Description: ${receipt.product_name || "-"}`,
                  `Notes: ${receipt.notes || "-"}`,
                ].join("\n")
              ).replace(/</g, "\\u003c")};
              const link = document.createElement("a");
              link.href = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
              link.style.display = "none";
              document.body.appendChild(link);
              link.click();
              link.remove();
            }
            
          // PDF Generation function for download (without images)
          async function generatePDF() {
            let pdfContent = null;
            try {
              window.scrollTo(0, 0);
              
              pdfContent = document.createElement('div');
              pdfContent.style.fontFamily = 'Arial, sans-serif';
              pdfContent.style.padding = '20px';
              pdfContent.style.position = 'absolute';
              pdfContent.style.left = '0';
              pdfContent.style.top = '0';
              pdfContent.style.width = '800px';
              pdfContent.style.background = '#ffffff';
              pdfContent.style.zIndex = '-1';
              
              const container = document.querySelector('.container').cloneNode(true);
              
              const toolbar = container.querySelector('.toolbar');
              if (toolbar) toolbar.remove();
              
              const imageSection = container.querySelector('.receipt-image-section');
              if (imageSection) imageSection.remove();
              
              pdfContent.appendChild(container);
              document.body.appendChild(pdfContent);
              
              if (typeof html2pdf === 'undefined') {
                await new Promise((resolve) => {
                  const script = document.createElement('script');
                  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                  script.onload = resolve;
                  document.head.appendChild(script);
                });
              }
              
              const opt = {
                margin: 10,
                filename: 'Receipt_${receipt.id || Date.now()}.pdf',
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { 
                  scale: 2,
                  useCORS: true,
                  logging: false,
                  scrollY: 0,
                  backgroundColor: '#ffffff'
                },
                jsPDF: { 
                  unit: 'mm', 
                  format: 'a4', 
                  orientation: 'portrait' 
                }
              };
              
              await html2pdf().set(opt).from(pdfContent).save();
              
            } catch (error) {
              console.error('PDF generation error:', error);
              alert('Failed to generate PDF. Please use the Print option instead.');
            } finally {
              if (pdfContent && pdfContent.parentNode) pdfContent.remove();
            }
          }
          
          // Attach event listeners when DOM is ready
          document.addEventListener('DOMContentLoaded', function() {
            const downloadBtn = document.getElementById('btn-download');
            const emailBtn = document.getElementById('btn-email');
            
            if (downloadBtn) {
              downloadBtn.addEventListener('click', generatePDF);
            }
            
            if (emailBtn) {
              emailBtn.addEventListener('click', emailReceipt);
            }
          });
          
          // Fallback if DOM is already loaded
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(function() {
              const downloadBtn = document.getElementById('btn-download');
              const emailBtn = document.getElementById('btn-email');
              
              if (downloadBtn) {
                downloadBtn.addEventListener('click', generatePDF);
              }
              
              if (emailBtn) {
                emailBtn.addEventListener('click', emailReceipt);
              }
            }, 100);
          }
        })();
      </script>
    </html>
  `;

  return (
    <>
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </>
  );
};

export default ViewReport;