import { useMemo } from "react";
import { filterReceipts } from "../utils/receiptFilters";
import { sortReceipts, sortYears } from "../utils/receiptSorting";

export const useReceiptGrouping = (receipts, filters, sortConfig, searchTerm) => {
  const filteredReceipts = useMemo(() => {
    return filterReceipts(receipts || [], filters, searchTerm);
    
  }, [receipts, filters, searchTerm]);

  const sortedReceipts = useMemo(() => {
    return sortReceipts(filteredReceipts, sortConfig);
  }, [filteredReceipts, sortConfig]);

  const { groupedReceipts, yearTotals, sortedYears } = useMemo(() => {
    if (!sortedReceipts.length) {
      return { groupedReceipts: {}, yearTotals: {}, sortedYears: [] };
    }

    // Group by year
    const groupedByYear = sortedReceipts.reduce((acc, receipt) => {
      const year = receipt.product_date
        ? new Date(Number(receipt.product_date) * 1000).getFullYear()
        : "Unknown";
      if (!acc[year]) acc[year] = [];
      acc[year].push(receipt);
      return acc;
    }, {});

    // Calculate year totals
    const yearTotals = {};
    Object.keys(groupedByYear).forEach((year) => {
      yearTotals[year] = groupedByYear[year].reduce(
        (sum, r) => sum + (Number(r.purchasePrice) || 0),
        0
      );
    });

    // Sort years based on sortConfig
    const sortedYears = sortYears(groupedByYear, yearTotals, sortConfig);

    return {
      groupedReceipts: groupedByYear,
      yearTotals,
      sortedYears,
    };
  }, [sortedReceipts, sortConfig]);

  return {
    groupedReceipts,
    yearTotals,
    sortedYears,
    filteredReceipts: sortedReceipts,
  };
};