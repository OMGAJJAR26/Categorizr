import * as XLSX from "xlsx";

const CsvExportModal = ({ data, onClose }) => {
  const exportToCsv = () => {
    // Prepare the data for CSV export with tax information
    const csvData = data.map((receipt) => {
      // Extract tax information from receipt_tax_values
      const taxValues = receipt.receipt_tax_values || [];
      const tax1 = taxValues[0] || {};
      const tax2 = taxValues[1] || {};

      return {
        "Purchase Date": receipt.purchaseDate,
        "Store Name": receipt.storeName,
        "Expense Type": receipt.receipt_category === "0" ? "Personal" : receipt.receipt_category === "1" ? "Business" : "—",
        Category: receipt.expense_type,
        "Payment Method": receipt.paymentType,
        Subtotal: receipt.subtotal,
        "Tax Type 1 Name": tax1.tax_name || "N/A",
        "Tax Type 1 Rate": tax1.tax_rate ? `${tax1.tax_rate}%` : "N/A",
        "Tax Type 1 Amount": tax1.tax_amount || 0,
        "Tax Type 2 Name": tax2.tax_name || "N/A",
        "Tax Type 2 Rate": tax2.tax_rate ? `${tax2.tax_rate}%` : "N/A",
        "Tax Type 2 Amount": tax2.tax_amount || 0,
        "Total Tax": receipt.tax,
        Tip: receipt.tip,
        Total: receipt.total,
        Description: receipt.description,
        Notes: receipt.notes,
        "Receipt Image": receipt.receiptImage,
        "Linked to Inventory": receipt.linkedToInventory ? "Yes" : "No",
      };
    });

    // Create worksheet with column width adjustments
    const ws = XLSX.utils.json_to_sheet(csvData);

    // Set column widths for better readability
    const wscols = [
      { wch: 12 }, // Purchase Date
      { wch: 20 }, // Store Name
      { wch: 12 }, // Receipt Type
      { wch: 12 }, // Expense Type
      { wch: 20 }, // Category
      { wch: 15 }, // Payment Method
      { wch: 10 }, // Subtotal
      { wch: 15 }, // Tax Type 1 Name
      { wch: 12 }, // Tax Type 1 Rate
      { wch: 12 }, // Tax Type 1 Amount
      { wch: 15 }, // Tax Type 2 Name
      { wch: 12 }, // Tax Type 2 Rate
      { wch: 12 }, // Tax Type 2 Amount
      { wch: 10 }, // Total Tax
      { wch: 8 }, // Tip
      { wch: 10 }, // Total
      { wch: 25 }, // Description
      { wch: 25 }, // Notes
      { wch: 20 }, // Receipt Image
      { wch: 18 }, // Linked to Inventory
    ];
    ws["!cols"] = wscols;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receipts");

    // Export to CSV with current date in filename
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `receipts_report_${dateStr}.csv`, { bookType: "csv" });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Export to CSV</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 w-auto"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <p>Your report is ready to be exported as CSV.</p>
          <p className="text-sm text-gray-500 mt-2">
            {data.length} records will be exported.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={exportToCsv}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default CsvExportModal;
