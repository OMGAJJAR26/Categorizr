import { useState } from "react";
import html2pdf from "html2pdf.js";
import SimpleAlertModal from "../components/SimpleAlertModal";

const iconSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="16" viewBox="0 0 14 16">
    <rect x="2" y="2" width="10" height="12" rx="2" fill="#fff" stroke="#1a73e8" stroke-width="1.5"/>
    <rect x="5" y="5" width="4" height="6" rx="1" fill="#1a73e8" />
  </svg>
`;

const SummaryReport = ({ receipts }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const generateSummaryHTML = (includeActions = false) => {
    const sortedReceipts = [...receipts].sort((a, b) => {
      const dateA = a.product_date ? Number(a.product_date) * 1000 : 0;
      const dateB = b.product_date ? Number(b.product_date) * 1000 : 0;
      return dateB - dateA; 
    });

    const receiptsByYear = {};
    sortedReceipts.forEach((receipt) => {
      const year = receipt.product_date
        ? new Date(Number(receipt.product_date) * 1000).getFullYear()
        : "Unknown";
      if (!receiptsByYear[year]) {
        receiptsByYear[year] = [];
      }
      receiptsByYear[year].push(receipt);
    });

    const sortedYears = Object.keys(receiptsByYear).sort((a, b) => b - a);

    const allTimestamps = receipts
      .map((r) => (r.product_date ? Number(r.product_date) * 1000 : null))
      .filter(Boolean);

    const oldestTimestamp = allTimestamps.length
      ? Math.min(...allTimestamps)
      : null;
    const latestTimestamp = allTimestamps.length
      ? Math.max(...allTimestamps)
      : null;

    const oldestDateStr = oldestTimestamp
      ? new Date(oldestTimestamp).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";
    const latestDateStr = latestTimestamp
      ? new Date(latestTimestamp).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

    const totalSum = sortedReceipts.reduce(
      (sum, r) => sum + (Number(r.purchasePrice) || 0),
      0
    );

    const getPaymentDisplayName = (receipt) => {
      return receipt.paymentType;
    };

    let html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
    `;

    if (includeActions) {
      html += `
        <div class="actions" style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Print</button>
          <button onclick="downloadAsPDF()" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Download as PDF</button>
          <button onclick="window.close()" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Close</button>
        </div>
      `;
    }

    html += `
        <div style="font-weight: bold; margin-bottom: 20px; font-size: 16px; text-align: center;">
          Receipt Summary Report
        </div>
        <div style="font-weight: bold; margin-bottom: 15px; font-size: 14px; color: #666;">
          Date Range: ${oldestDateStr} to ${latestDateStr}
        </div>
    `;

    let globalIndex = 1;

    sortedYears.forEach((year) => {
      const yearReceipts = receiptsByYear[year];
      const yearTotal = yearReceipts.reduce(
        (sum, r) => sum + (Number(r.purchasePrice) || 0),
        0
      );

      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-weight: bold; font-size: 14px; background: #e8f0fe; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px;">
            ${year} - Total: ₹${yearTotal.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
          </div>
          <table border="1" cellspacing="0" cellpadding="6" style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px;">
            <thead style="background: #f1f1f1; font-weight: bold;">
              <tr>
                <th style="text-align: left; font-size: 12px; min-width: 40px; padding: 8px;">#</th>
                <th style="text-align: left; font-size: 12px; min-width: 90px; padding: 8px;">Date</th>
                <th style="text-align: left; font-size: 12px; padding: 8px;">Merchant</th>
                <th style="text-align: left; font-size: 12px; padding: 8px;">Category</th>
                <th style="text-align: left; font-size: 12px; padding: 8px;">Payment Method</th>
                <th style="text-align: right; font-size: 12px; min-width: 80px; padding: 8px;">TOTAL</th>
                <th style="text-align: center; font-size: 12px; min-width: 50px; padding: 8px;">View</th>
              </tr>
            </thead>
            <tbody>
      `;

      yearReceipts.forEach((r, idx) => {
        const dateStr = r.product_date
          ? new Date(Number(r.product_date) * 1000).toLocaleDateString(
              "en-US",
              {
                day: "numeric",
                month: "short",
                year: "numeric",
              }
            )
          : "—";

        const background = idx % 2 === 0 ? "#ffffff" : "#f8f9fa";
        const imageUrl =
          r.emailAttachment && r.emailAttachment.trim() !== ""
            ? r.emailAttachment
            : null;

        const paymentDisplay = getPaymentDisplayName(r);

        html += `
          <tr style="background: ${background};">
            <td style="text-align: left; font-family: monospace; padding: 8px;">${String(
              globalIndex
            ).padStart(4, "0")}</td>
            <td style="text-align: left; padding: 8px;">${dateStr}</td>
            <td style="text-align: left; padding: 8px;">${
              r.storeName || "Untitled"
            }</td>
            <td style="text-align: left; padding: 8px;">${
              r.expense_type || "—"
            }</td>
            <td style="text-align: left; padding: 8px;">${
              paymentDisplay || "—"
            }</td>
            <td style="text-align: right; padding: 8px;">₹${Number(
              r.purchasePrice || 0
            ).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</td>
            <td style="text-align: center; padding: 8px;">
            ${
              imageUrl
                ? `<a href="${imageUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; width: 18px; height: 18px;">${iconSVG}</a>`
                : `<span style="display: inline-block; width: 18px; height: 18px; opacity: 0.3;">${iconSVG}</span>`
            }
            </td>
          </tr>
        `;
        globalIndex++;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    });

    html += `
      <div style="border-top: 2px solid #333; padding-top: 15px; margin-top: 20px;">
        <table style="width: 100%; font-size: 14px; font-weight: bold;">
          <tr>
            <td style="text-align: right; padding: 8px;">GRAND TOTAL:</td>
            <td style="text-align: right; padding: 8px; min-width: 120px;">₹${totalSum.toLocaleString(
              undefined,
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )}</td>
          </tr>
          <tr>
            <td style="text-align: right; padding: 8px;">Total Receipts:</td>
            <td style="text-align: right; padding: 8px;">${
              sortedReceipts.length
            }</td>
          </tr>
        </table>
      </div>
    </div>`;

    return html;
  };

  const downloadPDF = () => {
    const container = document.createElement("div");
    container.innerHTML = generateSummaryHTML(false);

    html2pdf()
      .from(container)
      .set({
        margin: 10,
        filename: `receipt-summary-report-${
          new Date().toISOString().split("T")[0]
        }.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        enableLinks: true,
      })
      .save();

    setShowPopup(false);
  };

  const viewPDF = () => {
    const htmlContent = generateSummaryHTML(true);
    const newWindow = window.open("", "_blank");
    if (newWindow && newWindow.document) {
      try {
        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Receipt Summary Report</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  margin: 20px;
                  background: white;
                }
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
              <div id="report-root">
                ${htmlContent}
              </div>
              <script>
                function downloadAsPDF() {
                  const element = document.getElementById('report-root');
                  const opt = {
                    margin: 10,
                    filename: 'receipt-summary-report-${
                      new Date().toISOString().split("T")[0]
                    }.pdf',
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
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
              </script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
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
    setShowPopup(false);
  };

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
      >
        Summary Report
      </button>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">
              Summary Report Options
            </h3>
            <p className="text-gray-600 mb-6">
              How would you like to generate your summary report?
            </p>

            <div className="flex flex-col space-y-3">
              <button
                onClick={viewPDF}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                View Report
              </button>

              <button
                onClick={downloadPDF}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
              >
                Download PDF
              </button>

              <button
                onClick={() => setShowPopup(false)}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </>
  );
};

export default SummaryReport;
