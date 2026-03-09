import { useState, useCallback } from "react";
import { generateTaxReportHTML, generateSummaryHTML } from "../utils/reportGenerators";

export const useReportGeneration = () => {
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState(null);

  const generateTaxReport = useCallback(({
    receipts,
    selectedTaxes,
    monthLabel,
    filters,
    sortConfig,
    searchTerm,
    formatCurrencyFixed2,
    userName = ""
  }) => {
    return generateTaxReportHTML({
      receipts,
      selectedTaxes,
      monthLabel,
      filters,
      sortConfig,
      searchTerm,
      formatCurrencyFixed2,
      userName
    });
  }, []);

  const generateSummaryReport = useCallback(({
    filters,
    sortConfig,
    searchTerm,
    filteredReceipts,
    formatCurrencyFixed2,
    userName = ""
  }) => {
    return generateSummaryHTML({
      filters,
      sortConfig,
      searchTerm,
      filteredReceipts,
      formatCurrencyFixed2,
      userName
    });
  }, []);

  return {
    showReportModal,
    setShowReportModal,
    reportType,
    setReportType,
    generateTaxReport,
    generateSummaryReport,
  };
};