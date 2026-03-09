import html2pdf from "html2pdf.js";

const CustomPDFGenerator = ({ filteredReceipts }) => {
  const handleDownloadPDF = () => {
    const element = document.getElementById("summary-pdf-content");
    const opt = {
      margin: 0.5,
      filename: "customized-summary.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    };
    html2pdf().from(element).set(opt).save();
  };

  
  const formatDate = (rawDate) => {
    if (!rawDate) return "N/A"; 
    const d = new Date(rawDate);
    return isNaN(d) ? rawDate : d.toLocaleDateString("en-GB");
  };

  return (
    <div className="mt-10 bg-white shadow-md rounded-md p-6">
      <div id="summary-pdf-content">
        <h2 className="text-xl font-bold mb-4">Filtered Receipt Summary</h2>

        {filteredReceipts.length === 0 ? (
          <p className="text-gray-600">No receipts match the selected filters.</p>
        ) : (
          <div className="space-y-4">
            {filteredReceipts.map((receipt, index) => (
              <div
                key={index}
                className="border border-gray-300 rounded-lg p-4"
              >
                <p><strong>Merchant:</strong> {receipt.merchant}</p>
                <p><strong>Category:</strong> {receipt.category}</p>
                <p><strong>Payment Method:</strong> {receipt.paymentMethod}</p>
                <p><strong>Date:</strong> {formatDate(receipt.date || receipt.receiptDate || receipt.createdAt)}</p>
                <p><strong>Amount:</strong> ${receipt.totalAmount}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {filteredReceipts.length > 0 && (
        <button
          onClick={handleDownloadPDF}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Download Summary
        </button>
      )}
    </div>
  );
};

export default CustomPDFGenerator;
