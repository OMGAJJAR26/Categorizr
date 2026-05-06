import { useState } from "react";
import html2pdf from "html2pdf.js";
import SimpleAlertModal from "../SimpleAlertModal";

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
  onApplyTaxTypes
}) => {
  const [alertMsg, setAlertMsg] = useState(null);

  if (!showReportModal) return null;

  const handleGenerateReport = async (format) => {
    let htmlContent = "";
    let fileName = "";
    let receiptsForReport = filteredReceipts;

    if (reportType === "tax") {
      const taxTypesToUse = filters.taxTypes.length > 0 
        ? filters.taxTypes 
        : [];
      
      htmlContent = generateTaxReport({
        receipts: receiptsForReport,
        selectedTaxes: taxTypesToUse,
        monthLabel: "",
        filters,
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
        filteredReceipts: receiptsForReport,
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
                          let text = col.textContent.trim();
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
      
      html2pdf()
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

        <div className="flex flex-col space-y-3">
          <button
            onClick={() => handleGenerateReport("view")}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            View Report
          </button>
          
          <button
            onClick={() => handleGenerateReport("pdf")}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
          >
            Download PDF
          </button>
          
          <button
            onClick={() => setShowReportModal(false)}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
};

export default ReportModals;