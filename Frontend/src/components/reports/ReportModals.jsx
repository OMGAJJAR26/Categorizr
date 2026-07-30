import { useState } from "react";
import html2pdf from "html2pdf.js";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import SimpleAlertModal from "../SimpleAlertModal";
import { collectReceiptMediaUrls } from "../../utils/mediaUrlUtils";
import { getPaymentDisplay as getReportPaymentDisplay } from "../../utils/reportGenerators";
import { matchesTaxTypes } from "../../utils/receiptFilters";

// Format a receipt's product_date the same way the report tables do: UTC calendar day
// (never one day earlier in timezones behind UTC), or "No Date" when undated.
const formatCsvDate = (productDate) =>
  productDate
    ? new Date(Number(productDate) * 1000).toLocaleDateString("en-US", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "No Date";

const ReportModals = ({
  showReportModal,
  reportType,
  setShowReportModal,
  filters,
  sortConfig,
  searchTerm,
  filteredReceipts,
  generateTaxReport,
  generateSummaryReport,
  formatCurrencyFixed2,
  onApplyTaxTypes,
  reportTaxTypes = [],
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  if (!showReportModal) return null;

  // Tax types for the TAX REPORT — chosen in the report's own popup (reportTaxTypes) or,
  // when the user already narrowed the list via the homepage filter, filters.taxTypes.
  // The report filters ITS OWN copy of the receipts by these, so selecting tax types for
  // the report never filters the main receipt screen.
  const taxReportTaxTypes =
    reportTaxTypes && reportTaxTypes.length > 0
      ? reportTaxTypes
      : (filters?.taxTypes || []);
  const taxReportReceipts =
    taxReportTaxTypes.length > 0
      ? (filteredReceipts || []).filter((r) => matchesTaxTypes(r, taxReportTaxTypes))
      : (filteredReceipts || []);
  const taxReportFilters = { ...filters, taxTypes: taxReportTaxTypes };

  // Helper function to generate CSV data
  const generateCSVData = () => {
    if (reportType === "tax") {
      return taxReportReceipts.map((receipt, index) => {
        const taxValues = receipt.receipt_tax_values || [];
        const taxes = taxValues.filter(
          (tax) => !(tax.tax_name || "").toLowerCase().includes("tip")
        );
        const tips = taxValues.find((tax) =>
          (tax.tax_name || "").toLowerCase().includes("tip")
        );
        const tipsAmount = tips ? Number(tips.tax_amount || 0) : 0;
        const totalTax = taxes.reduce(
          (sum, tax) => sum + (Number(tax.tax_amount) || 0),
          0
        );
        const total = Number(receipt.purchasePrice || 0);
        const subtotal = total - totalTax - tipsAmount;

        const taxTypesText = taxes
          .map((t) => {
            const rate = Math.round(Number(t.tax_rate) || 0);
            return `${t.tax_name || "Tax"} (${rate}%)`;
          })
          .join(", ");

        const taxAmountsText = taxes
          .map((t) => formatCurrencyFixed2(Number(t.tax_amount) || 0))
          .join(", ");

        // Parse receipt tags
        const receiptTags = receipt.receipt_tag
          ? receipt.receipt_tag.split(",").map((tag) => tag.trim())
          : [];
        const locked = receiptTags[0] === "1" ? "Yes" : "No";
        const activeTags = [];
        if (receiptTags[1] === "1") activeTags.push("Starred");
        if (receiptTags[2] === "1") activeTags.push("Flagged");
        if (receiptTags[3] === "1") activeTags.push("Verified");
        if (receiptTags[4] === "1") activeTags.push("Reconciled");
        if (receiptTags[5] === "1") activeTags.push("Reimbursement");
        if (receiptTags[6] === "1") activeTags.push("Warrantied");

        return {
          "#": String(index + 1).padStart(3, "0"),
          Date: formatCsvDate(receipt.product_date),
          Merchant: receipt.storeName || "Untitled",
          "Expense Type": receipt.receipt_category == 0 ? "Personal" : receipt.receipt_category == 1 ? "Business" : "—",
          Status: receipt.status === "0" ? "Unread" : receipt.status === "1" ? "Read" : "—",
          "Payment Method": getReportPaymentDisplay(receipt),
          Category: receipt.expense_type || "—",
          Subtotal: formatCurrencyFixed2(subtotal),
          "Tax Types": taxTypesText || "—",
          "Tax Amount": taxAmountsText || "—",
          Tips: formatCurrencyFixed2(tipsAmount),
          Total: formatCurrencyFixed2(total),
          "Receipt Image": collectReceiptMediaUrls(receipt).join(" ") || "—",
          Locked: locked,
          Tags: activeTags.join(", ") || "No tags",
        };
      });
    } else {
      // Summary Report CSV
      return filteredReceipts.map((receipt, index) => {
        return {
          "#": String(index + 1).padStart(4, "0"),
          Date: formatCsvDate(receipt.product_date),
          Merchant: receipt.storeName || "Untitled",
          "Expense Type": receipt.receipt_category == 0 ? "Personal" : receipt.receipt_category == 1 ? "Business" : "—",
          Status: receipt.status === "0" ? "Unread" : receipt.status === "1" ? "Read" : "—",
          Category: receipt.expense_type || "—",
          "Payment Method": getReportPaymentDisplay(receipt),
          Total: formatCurrencyFixed2(Number(receipt.purchasePrice) || 0),
          "Receipt Image": collectReceiptMediaUrls(receipt).join(" ") || "—",
        };
      });
    }
  };

  // Helper function to download CSV
  const handleDownloadCSV = () => {
    setIsGenerating(true);
    try {
      const csvData = generateCSVData();
      const ws = XLSX.utils.json_to_sheet(csvData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        reportType === "tax" ? "Tax Report" : "Summary Report"
      );

      const fileName = `${reportType}-report-${new Date().toISOString().split("T")[0]}.csv`;
      XLSX.writeFile(wb, fileName, { bookType: "csv" });
      setShowReportModal(false);
    } catch (error) {
      console.error("Error generating CSV:", error);
      setAlertMsg("Failed to generate CSV. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function to download ZIP (CSV + PDF)
  const handleDownloadZIP = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      const fileName = `${reportType}-report-${new Date().toISOString().split("T")[0]}`;

      // Generate CSV
      const csvData = generateCSVData();
      const ws = XLSX.utils.json_to_sheet(csvData);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      zip.file(`${fileName}.csv`, csvContent);

      // Generate PDF
      let htmlContent = "";
      if (reportType === "tax") {
        htmlContent = generateTaxReport({
          receipts: taxReportReceipts,
          selectedTaxes: taxReportTaxTypes,
          monthLabel: "",
          filters: taxReportFilters,
          sortConfig,
          searchTerm,
          formatCurrencyFixed2,
        });
      } else {
        htmlContent = generateSummaryReport({
          filters,
          sortConfig,
          searchTerm,
          filteredReceipts,
          formatCurrencyFixed2,
        });
      }

      const element = document.createElement("div");
      element.innerHTML = htmlContent;

      const pdfBlob = await html2pdf()
        .from(element)
        .set({
          margin: 10,
          filename: `${fileName}.pdf`,
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
          enableLinks: true,
        })
        .output("blob");

      zip.file(`${fileName}.pdf`, pdfBlob);

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowReportModal(false);
    } catch (error) {
      console.error("Error generating ZIP:", error);
      setAlertMsg("Failed to generate ZIP. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = async (format) => {
    setIsGenerating(true);
    
    try {
      let htmlContent = "";
      let fileName = "";

      if (reportType === "tax") {
        htmlContent = generateTaxReport({
          receipts: taxReportReceipts,
          selectedTaxes: taxReportTaxTypes,
          monthLabel: "",
          filters: taxReportFilters,
          sortConfig,
          searchTerm,
          formatCurrencyFixed2
        });

        fileName = `tax-report-${new Date().toISOString().split("T")[0]}`;
      } else if (reportType === "summary") {
        htmlContent = generateSummaryReport({
          filters,
          sortConfig,
          searchTerm,
          filteredReceipts,
          formatCurrencyFixed2
        });
        
        fileName = `summary-report-${new Date().toISOString().split("T")[0]}`;
      }

      if (format === "view") {
        const newWindow = window.open("", "_blank");
        if (newWindow && newWindow.document) {
          try {
            newWindow.document.write(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>${fileName}</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
                  <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background: white; }
                    .actions { margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; display: flex; gap: 10px; flex-wrap: wrap; }
                    .actions button { padding: 8px 16px; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
                    .actions button:hover { opacity: 0.9; }
                    .actions button:nth-child(1) { background: #10b981; }
                    .actions button:nth-child(2) { background: #8b5cf6; }
                    .actions button:nth-child(3) { background: #1a73e8; }
                    .actions button.close-btn { background: #6b7280; }
                    .actions button.close-btn:hover { background: #4b5563; }
                    @media print {
                      @page {
                        margin: 10mm;
                      }
                      body {
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                      }
                      .actions {
                        display: none !important;
                        visibility: hidden !important;
                      }
                    }
                  </style>
                </head>
                <body>
                  <div class="actions">
                    <button onclick="downloadAsPDF()">Download as PDF</button>
                    <button onclick="downloadAsCSV()">Download as CSV</button>
                    <button onclick="window.print()">Print</button>
                    <button onclick="window.close()" class="close-btn">Close</button>
                  </div>
                  <div id="report-root">${htmlContent}</div>
                  <script>
                    function downloadAsPDF() {
                      const element = document.getElementById('report-root');
                      const opt = {
                        margin: 10,
                        filename: '${fileName}.pdf',
                        html2canvas: { scale: 2, useCORS: true, logging: false },
                        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' },
                        enableLinks: true,
                      };
                      
                      const actionsDiv = document.querySelector('.actions');
                      if (actionsDiv) {
                        actionsDiv.style.display = 'none';
                      }
                      
                      html2pdf().set(opt).from(element).save().then(() => {
                        if (actionsDiv) {
                          actionsDiv.style.display = 'flex';
                        }
                      });
                    }

                    function downloadAsCSV() {
                      // Get table data from the report
                      const tables = document.querySelectorAll('table');
                      if (!tables.length) return;

                      let csvContent = '';
                      tables.forEach((table, tableIndex) => {
                        const rows = table.querySelectorAll('tr');
                        rows.forEach((row, rowIndex) => {
                          const cols = row.querySelectorAll('th, td');
                          const rowData = Array.from(cols).map(col => {
                            // For the receipt-image cell, export the real image URL(s)
                            // (all of them, space-separated) instead of the word "View".
                            const imgAnchor = col.querySelector('a[data-images]');
                            let text = imgAnchor
                              ? (imgAnchor.getAttribute('data-images') || '').split('|').filter(Boolean).join(' ')
                              : col.textContent.trim();
                            // Escape quotes and wrap in quotes if contains comma or newline
                            if (text.includes(',') || text.includes('"') || text.includes('\\n')) {
                              text = '"' + text.replace(/"/g, '""') + '"';
                            }
                            return text;
                          }).join(',');
                          csvContent += rowData + String.fromCharCode(10);
                        });
                        if (tableIndex < tables.length - 1) csvContent += String.fromCharCode(10);
                      });

                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = '${fileName}.csv';
                      link.click();
                      URL.revokeObjectURL(url);
                    }
                  </script>

                  <!-- Multi-image receipt viewer: opened by the "View" links. Shows all
                       of a receipt's images with left/right navigation (arrows/keyboard). -->
                  <div id="__imgViewer" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; align-items:center; justify-content:center; flex-direction:column;">
                    <div style="position:absolute; top:16px; right:20px;">
                      <button onclick="window.__closeReceiptImages()" style="background:#fff; border:none; border-radius:4px; padding:6px 12px; cursor:pointer; font-weight:600;">Close</button>
                    </div>
                    <div id="__imgViewerCounter" style="color:#fff; margin-bottom:10px; font-family:Arial, sans-serif; font-size:14px;"></div>
                    <div style="display:flex; align-items:center; gap:16px;">
                      <button id="__imgPrev" onclick="window.__viewerStep(-1)" style="background:#fff; border:none; border-radius:50%; width:46px; height:46px; font-size:24px; cursor:pointer;">&#8249;</button>
                      <div id="__imgViewerStage" style="width:80vw; height:80vh; display:flex; align-items:center; justify-content:center;"></div>
                      <button id="__imgNext" onclick="window.__viewerStep(1)" style="background:#fff; border:none; border-radius:50%; width:46px; height:46px; font-size:24px; cursor:pointer;">&#8250;</button>
                    </div>
                  </div>
                  <script>
                    (function(){
                      var imgs = [], idx = 0;
                      function isPdf(u){ u = (u || '').toLowerCase().split('?')[0]; return u.indexOf('.pdf') !== -1; }
                      function render(){
                        var stage = document.getElementById('__imgViewerStage');
                        var counter = document.getElementById('__imgViewerCounter');
                        if(!stage) return;
                        var u = imgs[idx];
                        stage.innerHTML = '';
                        var el;
                        if(isPdf(u)){
                          el = document.createElement('iframe');
                          el.src = u; el.style.width = '80vw'; el.style.height = '80vh';
                          el.style.border = 'none'; el.style.background = '#fff';
                        } else {
                          el = document.createElement('img');
                          el.src = u; el.style.maxWidth = '80vw'; el.style.maxHeight = '80vh'; el.style.objectFit = 'contain';
                        }
                        stage.appendChild(el);
                        if(counter) counter.textContent = (idx + 1) + ' / ' + imgs.length;
                        var multi = imgs.length > 1 ? 'inline-block' : 'none';
                        var p = document.getElementById('__imgPrev'); if(p) p.style.display = multi;
                        var n = document.getElementById('__imgNext'); if(n) n.style.display = multi;
                      }
                      window.__openReceiptImages = function(e, a){
                        if(e && e.preventDefault) e.preventDefault();
                        var data = (a && a.getAttribute('data-images')) || '';
                        imgs = data.split('|').filter(Boolean);
                        if(!imgs.length) return true;
                        idx = 0;
                        var v = document.getElementById('__imgViewer');
                        if(v) v.style.display = 'flex';
                        render();
                        return false;
                      };
                      window.__viewerStep = function(d){ if(!imgs.length) return; idx = (idx + d + imgs.length) % imgs.length; render(); };
                      window.__closeReceiptImages = function(){ var v = document.getElementById('__imgViewer'); if(v) v.style.display = 'none'; imgs = []; };
                      document.addEventListener('keydown', function(ev){
                        var v = document.getElementById('__imgViewer');
                        if(!v || v.style.display === 'none') return;
                        if(ev.key === 'Escape') window.__closeReceiptImages();
                        else if(ev.key === 'ArrowRight') window.__viewerStep(1);
                        else if(ev.key === 'ArrowLeft') window.__viewerStep(-1);
                      });
                    })();
                  </script>
                </body>
              </html>
            `);
            newWindow.document.close();
          } catch (error) {
            console.error("Error writing document:", error);
            if (newWindow) {
              newWindow.close();
            }
            setAlertMsg("Failed to generate report. Please try again.");
          }
        }

      } else if (format === "pdf") {
        const element = document.createElement("div");
        element.innerHTML = htmlContent;
        
        await html2pdf()
          .from(element)
          .set({
            margin: 10,
            filename: `${fileName}.pdf`,
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
            enableLinks: true,
          })
          .save();
      }
      
      setShowReportModal(false);
    } catch (error) {
      console.error("Error generating report:", error);
      setAlertMsg("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">
          {reportType === "tax" ? "Tax Report Options" : "Summary Report Options"}
        </h3>
        <p className="text-gray-600 mb-6">
          How would you like to generate your {reportType} report?
        </p>

        {isGenerating ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Generating report...</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => handleGenerateReport("view")}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={filteredReceipts.length === 0}
            >
              View Report
            </button>
            
            <button
              onClick={() => handleGenerateReport("pdf")}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={filteredReceipts.length === 0}
            >
              Download PDF
            </button>
            
            <button
              onClick={handleDownloadCSV}
              className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={filteredReceipts.length === 0}
            >
              Download CSV
            </button>
            
            <button
              onClick={handleDownloadZIP}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={filteredReceipts.length === 0}
            >
              Download ZIP (CSV + PDF)
            </button>
            
            <button
              onClick={() => setShowReportModal(false)}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
            
            {filteredReceipts.length === 0 && (
              <p className="text-red-500 text-sm text-center mt-2">
                No receipts to generate report
              </p>
            )}
          </div>
        )}
      </div>
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
};

export default ReportModals;