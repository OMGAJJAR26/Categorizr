import { useData } from "../context/DataContext";
import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { useDisableToggle } from "../hooks/useDisableToggle";
import CsvExportModal from "../components/CsvExportModal";
import PdfDownload from "../components/PdfDownloadCustomisedReport";
import SimpleAlertModal from "../components/SimpleAlertModal";
// import * as XLSX from "xlsx";

// All Hooks
const CustomizedReport = forwardRef((props, ref) => {
  const { merchants, expenseCategories, paymentMethods, receipts } = useData();
  const [showDatePopup, setShowDatePopup] = useState(false);
  // const [dateRange, setDateRange] = useState({});
  const [selectedExpenseTypes, setSelectedExpenseTypes] = useState([]);
  const [selectedMerchants, setSelectedMerchants] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState([]);
  const [selectedSubTotal, setSelectedSubTotal] = useState([]);
  const [showSubTotalPopup, setShowSubTotalPopup] = useState(false);
  const [selectedPurchasePrice, setSelectedPurchasePrice] = useState([]);
  const [showExpenseTypePopup, setShowExpenseTypePopup] = useState(false);
  const [showMerchantPopup, setShowMerchantPopup] = useState(false);
  const [showCategoryPopup, setShowCategoryPopup] = useState(false);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [showTotalPopup, setShowTotalPopup] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [exportData, setExportData] = useState([]);
  const [reportType, setReportType] = useState("");
  const [showTaxType1Popup, setShowTaxType1Popup] = useState(false);
  const [showTaxType2Popup, setShowTaxType2Popup] = useState(false);
  // const [showTipsPopup, setShowTipsPopup] = useState(false);
  const [selectedTaxes, setSelectedTaxes] = useState([null, null]);

  const [totalRange, setTotalRange] = useState({
    min: "",
    max: "",
    calculatedTotal: undefined,
  });

  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [removedFilters, setRemovedFilters] = useState({
    expenseType: false,
    merchant: false,
    category: false,
    paymentMethod: false,
    subTotal: false,
    taxType1: false,
    taxType2: false,
  });

  const [subtotalRange, setSubtotalRange] = useState({
    min: "",
    max: "",
    calculatedSubtotal: undefined,
  });

  const [includedFields, setIncludedFields] = useState({
    description: false,
    notes: false,
    receiptImage: false,
    linkedToInventory: false,
  });

  // Load saved merchants from localStorage on mount
  useEffect(() => {
    const savedMerchants = localStorage.getItem("selectedMerchants");
    if (savedMerchants) {
      try {
        setSelectedMerchants(JSON.parse(savedMerchants));
      } catch (e) {
        console.error("Error parsing saved merchants:", e);
      }
    }
  }, []);

  // Keep localStorage updated when merchants change
  useEffect(() => {
    if (selectedMerchants.length > 0) {
      localStorage.setItem("selectedMerchants", JSON.stringify(selectedMerchants));
    }
  }, [selectedMerchants]);

  const handleTotalApply = () => {
    setTotalRange((prev) => ({
      ...prev,
      calculatedTotal: {
        min: prev.min,
        max: prev.max,
      },
    }));
    setShowTotalPopup(false);

    const totalRangeStr = totalRange.min.concat("-", totalRange.max);
    setSelectedPurchasePrice((prev) =>
      prev.includes(totalRangeStr)
        ? prev.filter((m) => m !== totalRangeStr)
        : [...prev, totalRangeStr]
    );
  };

  const getUniqueTaxesFromReceipts = () => {
    const allTaxes = [];
    receipts.forEach((receipt) => {
      if (receipt.receipt_tax_values && receipt.receipt_tax_values.length > 0) {
        receipt.receipt_tax_values.forEach((tax) => {
          allTaxes.push({
            tax_name: tax.tax_name,
            tax_rate: tax.tax_rate,
            id: tax.fk_tax_id,
          });
        });
      }
    });

    const seen = new Set();
    return allTaxes.filter((tax) => {
      const key = `${tax.tax_name}-${tax.tax_rate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleSubtotalApply = () => {
    setSubtotalRange((prev) => ({
      ...prev,
      calculatedSubtotal: {
        min: prev.min,
        max: prev.max,
      },
    }));
    setShowSubTotalPopup(false);

    // Manage Subtotal Range
    const totalRange = subtotalRange.min.concat("-", subtotalRange.max);

    setSelectedSubTotal((prev) =>
      prev.includes(totalRange)
        ? prev.filter((m) => m !== totalRange)
        : [...prev, totalRange]
    );
  };

  // All toggle methods
  const toggleDateRange = () => {
    setDateRange((prev) => ({
      ...prev,
      startDate: prev.startDate ? undefined : new Date(),
      endDate: prev.endDate ? undefined : new Date(),
    }));
  };

  const toggleSubTotalMethod = (method) => {
    setSelectedSubTotal((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  };

  const toggleIncludedField = (field) => {
    setIncludedFields((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const toggleExpenseType = (type) => {
    setSelectedExpenseTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleMerchant = (merchant) => {
    setSelectedMerchants((prev) =>
      prev.includes(merchant)
        ? prev.filter((m) => m !== merchant)
        : [...prev, merchant]
    );
  };

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const togglePaymentMethod = (method) => {
    setSelectedPaymentMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  };

  const clearAllFilters = () => {
    setDateRange({ startDate: "", endDate: "", groupByMonth: false });
    setSelectedExpenseTypes([]);
    setSelectedMerchants([]);
    setSelectedCategories([]);
    setSelectedPaymentMethods([]);
    setSelectedSubTotal([]);
    setSelectedTaxes([null, null]);
    setSubtotalRange({ min: "", max: "", calculatedSubtotal: undefined });
    setTotalRange({ min: "", max: "", calculatedTotal: undefined });
    setGroupByCategory(false);

    setRemovedFilters({
      dateRange: false,
      expenseType: false,
      merchant: false,
      category: false,
      paymentMethod: false,
      subTotal: false,
    });
    setIncludedFields({
      dateRange: false,
      description: false,
      notes: false,
      receiptImage: false,
      linkedToInventory: false,
      taxType1: false,
      taxType2: false,
    });

    // Reset all disable toggles
    Object.keys(removedFilters).forEach((key) => {
      if (removedFilters[key]) toggleDisable(key);
    });
  };

  // Expose clearAllFilters to parent
  useImperativeHandle(ref, () => ({
    clearAllFilters,
  }));

  const { isDisabled, toggleDisable } = useDisableToggle({
    dateRange: false,
    expenseType: false,
    merchant: false,
    category: false,
    paymentMethod: false,
    subTotal: false,
    taxType1: false,
    taxType2: false,
    tips: false,
  });

  const handleCreateReport = () => {
    const filteredReceipts = receipts.filter((receipt) => {
      const categoryMap = {
        Personal: "0",
        Business: "1",
      };

      const selectedCodes = selectedExpenseTypes.map(
        (type) => categoryMap[type]
      );

      const matchesCategory =
        selectedCodes.length === 0 ||
        selectedCodes.includes(receipt.receipt_category);

      const matchesMerchant =
        selectedMerchants.length === 0 ||
        selectedMerchants.includes(receipt.storeName);

      const getPaymentDisplayName = (r) => {
        let issuer = r?.card_issuer_name?.trim();
        let type = r?.paymentType?.trim();
        if (!issuer) issuer = null;
        if (!issuer && !type) return "-";
        if (type?.toLowerCase().includes("cash")) return "Cash";
        const last4 = type?.includes("*") ? type.split("*").pop() : "";
        if (issuer) return `${issuer}${last4 ? ` *${last4}` : ""}`;
        if (type) return last4 ? `*${last4}` : type;
        return "-";
      };

      const matchesPaymentMethod =
        selectedPaymentMethods.length === 0 ||
        selectedPaymentMethods.includes(getPaymentDisplayName(receipt));

      const matchesSubtotal =
        !subtotalRange.min ||
        !subtotalRange.max ||
        (receipt.subtotal >= parseFloat(subtotalRange.min) &&
          receipt.subtotal <= parseFloat(subtotalRange.max));

      const matchesExpenseType =
        selectedCategories.length === 0 ||
        selectedCategories.includes(receipt.expense_type);

      const matchesTaxType1 =
        !selectedTaxes[0] ||
        (receipt.receipt_tax_values &&
          receipt.receipt_tax_values.some(
            (tax) =>
              tax.tax_name === selectedTaxes[0].tax_name &&
              tax.tax_rate == selectedTaxes[0].tax_rate
          ));

      const matchesTaxType2 =
        !selectedTaxes[1] ||
        (receipt.receipt_tax_values &&
          receipt.receipt_tax_values.some(
            (tax) =>
              tax.tax_name === selectedTaxes[1].tax_name &&
              tax.tax_rate == selectedTaxes[1].tax_rate
          ));

      const matchesDate = (() => {
        if (!dateRange.startDate || !dateRange.endDate) return true;
        const receiptTs = Number(receipt.product_date || receipt.create_date);
        if (!Number.isFinite(receiptTs)) return false;
        const d = new Date(receiptTs * 1000);
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        end.setHours(23, 59, 59, 999); // inclusive end of day
        return d >= start && d <= end;
      })();

      // const matchesTotal =
      //   !totalRange.min ||
      //   !selectedTips[0] ||
      //   (receipt.receipt_tip_values &&
      //     receipt.receipt_tip_values.some(
      //       (tip) =>
      //         tip.tip_name === selectedTips[0].tip_name &&
      //         tip.tip_rate == selectedTips[0].tip_rate
      //     ));

      const matchesTotal =
        !totalRange.min ||
        !totalRange.max ||
        (receipt.purchasePrice >= parseFloat(totalRange.min) &&
          receipt.purchasePrice <= parseFloat(totalRange.max));

      return (
        matchesDate &&
        matchesExpenseType &&
        matchesMerchant &&
        matchesCategory &&
        matchesPaymentMethod &&
        matchesSubtotal &&
        matchesTaxType1 &&
        matchesTaxType2 &&
        matchesTotal
      );
    });

    if (reportType === "csv") {
      setExportData(filteredReceipts);
      setShowExportModal(true);
    } else if (reportType === "pdf") {
      if (filteredReceipts.length === 0) {
        setAlertMsg("No data found for selected filters!");
        return;
      }

      PdfDownload({
        receipts: filteredReceipts,
        groupByCategory,
        groupByMonth: dateRange.groupByMonth || false,
      });
    }
  };
  return (
    <>
      {/* All Popup FIlters */}
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {/* Date Range Popup */}
        {showDatePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Date Range</h2>
                <button
                  onClick={() => setShowDatePopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>

              {/* Start Date */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                {/* Group by Month */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="groupByMonth"
                    checked={dateRange.groupByMonth}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        groupByMonth: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor="groupByMonth" className="ml-2 text-sm">
                    Group by Month
                  </label>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setDateRange({
                      startDate: "",
                      endDate: "",
                      groupByMonth: false,
                    });
                    setShowDatePopup(false);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowDatePopup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expense Type Popup */}
        {showExpenseTypePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Expense Types</h2>
                <button
                  onClick={() => setShowExpenseTypePopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto  "
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                {["Business", "Personal"].map((type) => (
                  <div key={type} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`expense-${type}`}
                      checked={selectedExpenseTypes.includes(type)}
                      onChange={() => toggleExpenseType(type)}
                      className="h-4 w-4 m-0 text-blue-600 rounded"
                    />
                    <label htmlFor={`expense-${type}`} className="ml-2">
                      {type}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowExpenseTypePopup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Merchant Popup */}
        {showMerchantPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Merchants</h2>
                <button
                  onClick={() => setShowMerchantPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {merchants && merchants.length > 0 ? (
                  merchants.map((merchant) => (
                    <div key={merchant} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`merchant-${merchant}`}
                        checked={selectedMerchants.includes(merchant)}
                        onChange={() => toggleMerchant(merchant)}
                        className="h-4 w-4  text-blue-600 rounded m-0"
                      />
                      <label htmlFor={`merchant-${merchant}`} className="ml-2">
                        {merchant}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No merchants available</p>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowMerchantPopup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Category Popup */}
        {showCategoryPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold ">Select Categories</h2>
                <button
                  onClick={() => setShowCategoryPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {expenseCategories.map((category) => (
                  <div key={category} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`category-${category}`}
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                      className="h-4 w-4 m-0 text-blue-600 rounded "
                    />
                    <label htmlFor={`category-${category}`} className="ml-2">
                      {category}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowCategoryPopup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Payment Method Popup */}
        {showPaymentPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Payment Methods</h2>
                <button
                  onClick={() => setShowPaymentPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {paymentMethods.map((method) => (
                  <div key={method} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`method-${method}`}
                      checked={selectedPaymentMethods.includes(method)}
                      onChange={() => togglePaymentMethod(method)}
                      className="h-4 w-4 m-0 text-blue-600 rounded"
                    />
                    <label htmlFor={`method-${method}`} className="ml-2">
                      {method}
                    </label>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowPaymentPopup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {showSubTotalPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md ">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Subtotal Range</h2>
                <button
                  onClick={() => setShowSubTotalPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Minimum Amount
                  </label>
                  <input
                    type="number"
                    value={subtotalRange.min}
                    onChange={(e) =>
                      setSubtotalRange({
                        ...subtotalRange,
                        min: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter minimum amount"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Maximum Amount
                  </label>
                  <input
                    type="number"
                    value={subtotalRange.max}
                    onChange={(e) =>
                      setSubtotalRange({
                        ...subtotalRange,
                        max: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter maximum amount"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSubtotalApply}
                  onChange={toggleSubTotalMethod}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {showExportModal && (
          <CsvExportModal
            data={exportData}
            onClose={() => setShowExportModal(false)}
          />
        )}

        {showTaxType1Popup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Tax Type #1</h2>
                <button
                  onClick={() => setShowTaxType1Popup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {getUniqueTaxesFromReceipts().length > 0 ? (
                  getUniqueTaxesFromReceipts()
                    .filter(
                      (tax) =>
                        !selectedTaxes[1] ||
                        `${tax.tax_name}-${tax.tax_rate}` !==
                          `${selectedTaxes[1].tax_name}-${selectedTaxes[1].tax_rate}`
                    )
                    .map((tax) => (
                      <div
                        key={`${tax.tax_name}-${tax.tax_rate}`}
                        className="flex items-center"
                      >
                        <input
                          type="radio"
                          name="taxType1"
                          id={`tax1-${tax.id}`}
                          checked={
                            selectedTaxes[0] &&
                            selectedTaxes[0].tax_name === tax.tax_name &&
                            selectedTaxes[0].tax_rate === tax.tax_rate
                          }
                          onChange={() => {
                            setSelectedTaxes((prev) => [tax, prev[1]]);
                          }}
                          className="h-4 w-4 text-blue-600 rounded m-0"
                        />
                        <label htmlFor={`tax1-${tax.id}`} className="ml-2">
                          {tax.tax_name} ({tax.tax_rate}%)
                        </label>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-500">No tax data available</p>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowTaxType1Popup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {showTaxType2Popup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Select Tax Type #2</h2>
                <button
                  onClick={() => setShowTaxType2Popup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {getUniqueTaxesFromReceipts().length > 0 ? (
                  getUniqueTaxesFromReceipts()
                    .filter(
                      (tax) =>
                        !selectedTaxes[0] ||
                        `${tax.tax_name}-${tax.tax_rate}` !==
                          `${selectedTaxes[0].tax_name}-${selectedTaxes[0].tax_rate}`
                    )
                    .map((tax) => (
                      <div
                        key={`${tax.tax_name}-${tax.tax_rate}-2`}
                        className="flex items-center"
                      >
                        <input
                          type="radio"
                          name="taxType2"
                          id={`tax2-${tax.id}`}
                          checked={
                            selectedTaxes[1] &&
                            selectedTaxes[1].tax_name === tax.tax_name &&
                            selectedTaxes[1].tax_rate === tax.tax_rate
                          }
                          onChange={() => {
                            setSelectedTaxes((prev) => [prev[0], tax]);
                          }}
                          className="h-4 w-4 text-blue-600 rounded m-0"
                        />
                        <label htmlFor={`tax2-${tax.id}`} className="ml-2">
                          {tax.tax_name} ({tax.tax_rate}%)
                        </label>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-500">No tax data available</p>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowTaxType2Popup(false)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
        {/* {showTipsPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md ">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Tips</h2>
                <button
                  onClick={() => setShowTipsPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div> */}

        {/* <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Minimum Amount
                  </label>
                  <input
                    type="number"
                    value={tipsRange.min}
                    onChange={(e) =>
                      setTipsRange({
                        ...tipsRange,
                        min: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter minimum amount"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Maximum Amount
                  </label>
                  <input
                    type="number"
                    value={tipsRange.max}
                    onChange={(e) =>
                      setTipsRange({
                        ...tipsRange,
                        max: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter maximum amount"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div> */}

        {/* <div className="mt-6 flex justify-end">
                <button
                  onClick={handleTipsApply}
                  onChange={toggleTipsMethod}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div> */}
        {/* </div>
          </div>
        )} */}
        {showTotalPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Total Range</h2>
                <button
                  onClick={() => setShowTotalPopup(false)}
                  className="text-gray-500 hover:text-gray-700 w-auto"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Minimum Amount
                  </label>
                  <input
                    type="number"
                    value={totalRange.min}
                    onChange={(e) =>
                      setTotalRange({
                        ...totalRange,
                        min: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter minimum amount"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Maximum Amount
                  </label>
                  <input
                    type="number"
                    value={totalRange.max}
                    onChange={(e) =>
                      setTotalRange({
                        ...totalRange,
                        max: e.target.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter maximum amount"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleTotalApply}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Left side - Receipt Information */}
        <div className="flex-1 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4 border-b pb-2 text-center">
            Receipt Information
          </h2>
          {/* Date Range */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowDatePopup(true)}
                  disabled={isDisabled("dateRange")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("dateRange") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("dateRange") ? "gray" : "blue",
                    backgroundColor: isDisabled("dateRange")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("dateRange")
                      ? "not-allowed"
                      : "pointer",
                    position: "relative",
                  }}
                >
                  {dateRange.startDate && dateRange.endDate
                    ? `${dateRange.startDate} to ${dateRange.endDate}`
                    : "Date Range"}
                </button>
                {!isDisabled("dateRange") &&
                  dateRange.startDate &&
                  dateRange.endDate && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRange({
                          startDate: "",
                          endDate: "",
                          groupByMonth: false,
                        });
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "55%",
                        transform: "translateY(-50%)",
                        color: "blue",
                        cursor: "pointer",
                        fontWeight: "normal",
                      }}
                    >
                      ✕
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  checked={dateRange.groupByMonth || false}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      groupByMonth: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 m-0"
                />
                <label>Group by month</label>
              </div>
            </div>
            {dateRange.startDate && dateRange.endDate && !isDisabled("dateRange") && (
              <div className="ml-1 text-sm text-black font-semibold italic">
                {dateRange.startDate} to {dateRange.endDate}
              </div>
            )}
          </div>
          {/* Expense Type */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowExpenseTypePopup(true)}
                  disabled={isDisabled("expenseType")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("expenseType") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("expenseType") ? "gray" : "blue",
                    backgroundColor: isDisabled("expenseType")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("expenseType")
                      ? "not-allowed"
                      : "pointer",
                    position: "relative",
                  }}
                >
                  Expense Type
                </button>
                {!isDisabled("expenseType") &&
                  selectedExpenseTypes.length > 0 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation(); // prevent opening popup
                        setSelectedExpenseTypes([]); // clear selections
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "55%",
                        transform: "translateY(-50%)",
                        color: "blue",
                        cursor: "pointer",
                        fontWeight: "normal",
                      }}
                    >
                      ✕
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 m-0"
                  checked={isDisabled("expenseType")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExpenseTypes([]); // clear selected items
                      toggleDisable("expenseType"); // disable the button
                    } else {
                      toggleDisable("expenseType"); // enable the button
                    }
                  }}
                />
                <label>Remove</label>
              </div>
            </div>

            {/* Selected options below the button */}
            {selectedExpenseTypes.length > 0 && !isDisabled("expenseType") && (
              <div className="ml-1 text-sm text-black font-semibold italic">
                {selectedExpenseTypes.join(", ")}
              </div>
            )}
          </div>

          {/* Merchant */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowMerchantPopup(true)}
                  disabled={isDisabled("merchant")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("merchant") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("merchant") ? "gray" : "blue",
                    backgroundColor: isDisabled("merchant")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("merchant") ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  Merchant
                </button>
                {!isDisabled("merchant") && selectedMerchants.length > 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation(); // prevent opening popup
                      setSelectedMerchants([]); // clear selections
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      color: "blue",
                      cursor: "pointer",
                      fontWeight: "normal",
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 m-0"
                  checked={isDisabled("merchant")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExpenseTypes([]); // clear selected items
                      toggleDisable("merchant"); // disable the button
                    } else {
                      toggleDisable("merchant"); // enable the button
                    }
                  }}
                />
                <label>Remove</label>
              </div>
            </div>

            {/* Selected options below the button */}
            {selectedMerchants.length > 0 && !isDisabled("merchant") && (
              <div className="ml-1 text-sm text-black font-semibold italic">
                {selectedMerchants.length > 2
                  ? `${selectedMerchants.slice(0, 2).join(", ")} +${
                      selectedMerchants.length - 2
                    }`
                  : selectedMerchants.join(", ")}
              </div>
            )}
          </div>

          {/* Expense Category */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowCategoryPopup(true)}
                  disabled={isDisabled("category")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("category") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("category") ? "gray" : "blue",
                    backgroundColor: isDisabled("category")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("category") ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  Expense Category
                </button>
                {!isDisabled("category") && selectedCategories.length > 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation(); // prevent opening popup
                      setSelectedCategories([]); // clear selections
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      color: "blue",
                      cursor: "pointer",
                      fontWeight: "normal",
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div
                className="flex items-center  text-blue-600 "
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  marginLeft: "8px",
                }}
              >
                <div className="flex items-center gap-2 text-blue-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 m-0 "
                    checked={isDisabled("category")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCategories([]); // clear selected items
                        toggleDisable("category"); // disable the button
                      } else {
                        toggleDisable("category"); // enable the button
                      }
                    }}
                  />
                  <label>Remove</label>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <input
                    type="checkbox"
                    checked={groupByCategory}
                    onChange={(e) => setGroupByCategory(e.target.checked)} // <-- toggle state
                    className="h-4 w-4 m-0"
                  />
                  <label>Group by category</label>
                </div>
              </div>
            </div>

            {/* Selected options below the button */}
            {selectedCategories.length > 0 && !isDisabled("category") && (
              <div className="ml-1 text-sm text-black font-semibold italic">
                {selectedCategories.length > 2
                  ? `${selectedCategories.slice(0, 2).join(", ")} +${
                      selectedCategories.length - 2
                    }`
                  : selectedCategories.join(", ")}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowPaymentPopup(true)}
                  disabled={isDisabled("paymentMethod")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("paymentMethod") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("paymentMethod") ? "gray" : "blue",
                    backgroundColor: isDisabled("paymentMethod")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("paymentMethod")
                      ? "not-allowed"
                      : "pointer",
                    position: "relative",
                  }}
                >
                  Payment Method
                </button>
                {!isDisabled("paymentMethod") &&
                  selectedPaymentMethods.length > 0 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation(); // prevent opening popup
                        setSelectedPaymentMethods([]); // clear selections
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "55%",
                        transform: "translateY(-50%)",
                        color: "blue",
                        cursor: "pointer",
                        fontWeight: "normal",
                      }}
                    >
                      ✕
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 m-0"
                  checked={isDisabled("paymentMethod")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPaymentMethods([]); // clear selected items
                      toggleDisable("paymentMethod"); // disable the button
                    } else {
                      toggleDisable("paymentMethod"); // enable the button
                    }
                  }}
                />
                <label>Remove</label>
              </div>
            </div>

            {/* Selected options below the button */}
            {selectedPaymentMethods.length > 0 &&
              !isDisabled("paymentMethod") && (
                <div className="ml-1 text-sm text-black font-semibold italic">
                  {selectedPaymentMethods.length > 2
                    ? `${selectedPaymentMethods.slice(0, 2).join(", ")} +${
                        selectedPaymentMethods.length - 2
                      }`
                    : selectedPaymentMethods.join(", ")}
                </div>
              )}
          </div>
        </div>
        {/* Right side - Receipt Totals */}
        <div className="flex-1 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4 border-b pb-2 text-center">
            Receipt Totals
          </h2>

          {/* Subtotal */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowSubTotalPopup(true)}
                  disabled={isDisabled("subTotal")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("subTotal") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("subTotal") ? "gray" : "blue",
                    backgroundColor: isDisabled("subTotal")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("subTotal") ? "not-allowed" : "pointer",
                  }}
                >
                  Subtotal
                </button>
                {!isDisabled("subTotal") &&
                  subtotalRange.calculatedSubtotal !== undefined && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        // Clear all subtotal filters
                        setSubtotalRange({
                          min: "",
                          max: "",
                          calculatedSubtotal: undefined,
                        });
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "55%",
                        transform: "translateY(-50%)",
                        color: "blue",
                        cursor: "pointer",
                        fontWeight: "normal",
                      }}
                    >
                      ✕
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  checked={isDisabled("subTotal")}
                  onChange={() => {
                    toggleDisable("subTotal");
                    if (!isDisabled("subTotal")) {
                      // Clear filters when re-enabling
                      setSubtotalRange({
                        min: "",
                        max: "",
                        calculatedSubtotal: undefined,
                      });
                    }
                  }}
                  className="h-4 w-4 m-0"
                />
                <label>Remove</label>
              </div>
            </div>
            {subtotalRange.calculatedSubtotal !== undefined &&
              !isDisabled("subTotal") && (
                <div className="ml-1 text-sm text-black font-semibold italic">
                  Range: {subtotalRange.min || "0"} to{" "}
                  {subtotalRange.max || "∞"}
                </div>
              )}
          </div>

          {/* Tax Type #1 Button */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowTaxType1Popup(true)}
                  disabled={isDisabled("taxType1")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("taxType1") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("taxType1") ? "gray" : "blue",
                    backgroundColor: isDisabled("taxType1")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("taxType1") ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  {selectedTaxes[0]
                    ? `${selectedTaxes[0].tax_name}`
                    : "Tax Type #1"}
                </button>
                {!isDisabled("taxType1") && selectedTaxes[0] && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTaxes((prev) => [null, prev[1]]);
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      color: "blue",
                      cursor: "pointer",
                      fontWeight: "normal",
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  checked={isDisabled("taxType1")}
                  onChange={() => toggleDisable("taxType1")}
                  className="h-4 w-4 m-0"
                />
                <label>Remove</label>
              </div>
            </div>
            {!isDisabled("taxType1") && selectedTaxes[0] && (
              <div className="ml-1 text-sm italic text-black font-semibold">
                {selectedTaxes[0].tax_rate}%
              </div>
            )}
          </div>

          {/* Tax Type #2 Button */}
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowTaxType2Popup(true)}
                  disabled={isDisabled("taxType2")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("taxType2") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("taxType2") ? "gray" : "blue",
                    backgroundColor: isDisabled("taxType2")
                      ? "#e5e7eb"
                      : "white",
                    cursor: isDisabled("taxType2") ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  {selectedTaxes[1]
                    ? `${selectedTaxes[1].tax_name}`
                    : "Tax Type #2"}
                </button>
                {!isDisabled("taxType2") && selectedTaxes[1] && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTaxes((prev) => [prev[0], null]); // Fixed this line
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "55%",
                      transform: "translateY(-50%)",
                      color: "blue",
                      cursor: "pointer",
                      fontWeight: "normal",
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  checked={isDisabled("taxType2")}
                  onChange={() => toggleDisable("taxType2")}
                  className="h-4 w-4 m-0"
                />
                <label>Remove</label>
              </div>
            </div>
            {!isDisabled("taxType2") && selectedTaxes[1] && (
              <div className="ml-1 text-sm italic text-black font-semibold">
                {selectedTaxes[1].tax_rate}%
              </div>
            )}
          </div>

          {/* Total */}
          <div className="flex flex-col gap-1">
            <div className="flex gap-2 items-center">
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  onClick={() => setShowTotalPopup(true)}
                  disabled={isDisabled("total")}
                  style={{
                    width: "220px",
                    margin: "0",
                    border: "1px solid",
                    borderColor: isDisabled("total") ? "gray" : "blue",
                    borderRadius: "9px",
                    padding: "5px 30px 5px 10px",
                    color: isDisabled("total") ? "gray" : "blue",
                    backgroundColor: isDisabled("total") ? "#e5e7eb" : "white",
                    cursor: isDisabled("total") ? "not-allowed" : "pointer",
                  }}
                >
                  Total
                </button>
                {!isDisabled("total") &&
                  totalRange.calculatedTotal !== undefined && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setTotalRange({
                          min: "",
                          max: "",
                          calculatedTotal: undefined,
                        });
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "55%",
                        transform: "translateY(-50%)",
                        color: "blue",
                        cursor: "pointer",
                        fontWeight: "normal",
                      }}
                    >
                      ✕
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-2 ml-2 text-blue-600">
                <input
                  type="checkbox"
                  checked={isDisabled("total")}
                  onChange={() => {
                    toggleDisable("total");
                    if (!isDisabled("total")) {
                      setTotalRange({
                        min: "",
                        max: "",
                        calculatedTotal: undefined,
                      });
                    }
                  }}
                  className="h-4 w-4 m-0"
                />
                <label>Remove</label>
              </div>
            </div>
            {totalRange.calculatedTotal !== undefined &&
              !isDisabled("total") && (
                <div className="ml-1 text-sm text-black font-semibold italic">
                  Range: {totalRange.min || "0"} to {totalRange.max || "∞"}
                </div>
              )}
          </div>
        </div>
      </div>

      <h4 className="text-blue-600 font-bold ml-4 mt-4">
        Include the following:{" "}
      </h4>
      <div className="flex items-center gap-2 ml-4 mt-2 text-blue-600 font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 m-0"
          checked={includedFields.description}
          onChange={() => toggleIncludedField("description")}
        />
        <label>Description of purchase</label>
      </div>
      <div className="flex items-center gap-2 ml-4 mt-2 text-blue-600 font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 m-0"
          checked={includedFields.notes}
          onChange={() => toggleIncludedField("notes")}
        />
        <label>Notes</label>
      </div>
      <div className="flex items-center gap-2 ml-4 mt-2 text-blue-600 font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 m-0"
          checked={includedFields.receiptImage}
          onChange={() => toggleIncludedField("receiptImage")}
        />
        <label>Receipt image URL</label>
      </div>
      <div className="flex items-center gap-2 ml-4 mt-2 text-blue-600 font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 m-0"
          checked={includedFields.linkedToInventory}
          onChange={() => toggleIncludedField("linkedToInventory")}
        />
        <label>Linked to Inventory (Yes / No)</label>
      </div>

      <select
        className="mt-1 block w-64 rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-300 focus:ring-opacity-50 text-gray-700 items-center font-medium"
        style={{ marginTop: "30px", marginLeft: "36%" }}
        value={reportType}
        onChange={(e) => setReportType(e.target.value)}
      >
        <option value="">Select Report Type</option>
        <option value="pdf">PDF</option>
        <option value="csv">CSV</option>
      </select>

      <button
        type="button"
        onClick={handleCreateReport}
        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 w-64 rounded"
        style={{ marginTop: "20px", marginLeft: "36%" }}
      >
        Create Report
      </button>
      {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </>
  );
});

export default CustomizedReport;
